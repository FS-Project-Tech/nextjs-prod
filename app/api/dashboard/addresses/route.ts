import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import {
  getAddresses,
  getDeletedIds,
  upsertAddress,
  addDeletedId,
  removeDeletedId,
} from "@/lib/addresses-memory-store";
import { loadFromFile } from "@/lib/addresses-file-store";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";
import { mergeAddressListWithWooPrimaries } from "@/lib/wc-primary-addresses";
import { getToken } from "next-auth/jwt";

async function getWpUserMe(token: string): Promise<{ id: string | null; email: string | null }> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return { id: null, email: null };
  const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!userResponse.ok) return { id: null, email: null };
  const user = await userResponse.json();
  return {
    id: user?.id != null ? String(user.id) : (user?.slug ?? null),
    email: user?.email != null ? String(user.email) : null,
  };
}

/** Get all fallback addresses (memory + file) so they persist after refresh / different process */
function getFallbackAddresses(userId: string): Record<string, unknown>[] {
  const fromMemory = getAddresses(userId);
  const fromFile = loadFromFile(userId);
  const fileList = fromFile?.addresses ?? [];
  const byId = new Map<string, Record<string, unknown>>();
  // Merge both: file is source of truth for persistence (survives restart), memory may have recent updates
  for (const a of fileList) {
    const id = String(a.id ?? "");
    if (id) byId.set(id, a);
  }
  for (const a of fromMemory) {
    const id = String(a.id ?? "");
    if (id) byId.set(id, a); // memory overwrites file (more recent)
  }
  return Array.from(byId.values());
}

/** GET .../customers/v1/addresses-secondary or .../addresses → { addresses: [...] } */
async function fetchWpAddressList(
  wpBase: string,
  path: string,
  token: string
): Promise<{ ok: boolean; status: number; list: Record<string, unknown>[] }> {
  try {
    const res = await fetch(`${wpBase}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, status: res.status, list: [] };
    }
    const data = await res.json();
    const arr = data?.addresses;
    return { ok: true, status: res.status, list: Array.isArray(arr) ? arr : [] };
  } catch {
    return { ok: false, status: 0, list: [] };
  }
}

/** Stable id when Address Book API omits `id` (avoid unstable list order). */
function ensureRestAddressId(raw: Record<string, unknown>, index: number): string {
  const id = String(raw.id ?? "").trim();
  if (id) return id;
  const normPieces = [
    raw.type,
    raw.address_1,
    raw.postcode,
    raw.city,
    raw.first_name,
    raw.last_name,
    String(index),
  ];
  const h = createHash("sha256")
    .update(normPieces.map((x) => String(x ?? "")).join("|"))
    .digest("hex")
    .slice(0, 14);
  return `wp-${h}`;
}

/**
 * Merge Address Book (`/customers/v1/addresses`) with billing2/shipping2 (`/addresses-secondary`)
 * and local fallback. Previously we returned early when secondary returned 200, so full Address Book
 * entries (e.g. "ABC", "NIKS BILLING") never appeared on the dashboard.
 */
function mergeRemoteAndOptionalFallbackAddresses(
  bookList: Record<string, unknown>[],
  secondaryList: Record<string, unknown>[],
  fallbackList: Record<string, unknown>[],
  deleted: Set<string>
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  let i = 0;
  const put = (raw: Record<string, unknown>) => {
    const id = ensureRestAddressId(raw, i++);
    byId.set(id, normalizeAddressFromWp(raw, id));
  };
  for (const a of bookList) put(a);
  for (const a of secondaryList) put(a);
  for (const a of fallbackList) {
    const id = String((a as Record<string, unknown>).id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, normalizeAddressFromWp(a as Record<string, unknown>, id));
    }
  }
  return Array.from(byId.values()).filter((a) => !deleted.has(String(a.id).toLowerCase()));
}

/**
 * GET /api/dashboard/addresses
 * Fetch addresses for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      if (process.env.NODE_ENV === "development")
        console.log("[addresses] GET – 401 Not authenticated (no wpToken)");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const { id: userId, email: userEmail } = await getWpUserMe(token);
    // Use userId (WordPress) as primary key; fallback to token.sub so save/load use same key after refresh
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";
    if (!fileStoreKey) {
      if (process.env.NODE_ENV === "development") console.log("[addresses] GET – no userId or sub");
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }
    if (process.env.NODE_ENV === "development")
      console.log("[addresses] GET userId:", userId, "fileStoreKey:", fileStoreKey);

    const noStore = { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } };
    const finalize = (merged: Record<string, unknown>[]) =>
      mergeAddressListWithWooPrimaries(merged, userEmail, token);

    const fallbackList = getFallbackAddresses(fileStoreKey);
    const deleted = getDeletedIds(fileStoreKey);

    const [bookRes, secondaryRes] = await Promise.all([
      fetchWpAddressList(wpBase, "/wp-json/customers/v1/addresses", token),
      fetchWpAddressList(wpBase, "/wp-json/customers/v1/addresses-secondary", token),
    ]);

    if (process.env.NODE_ENV === "development") {
      console.log(
        "[addresses] GET address-book:",
        bookRes.ok ? bookRes.list.length : `fail ${bookRes.status}`,
        "secondary:",
        secondaryRes.ok ? secondaryRes.list.length : `fail ${secondaryRes.status}`
      );
    }

    const merged = mergeRemoteAndOptionalFallbackAddresses(
      bookRes.list,
      secondaryRes.list,
      fallbackList,
      deleted
    );

    const withPrimaries = await finalize(merged);
    /** Tombstones must apply after WC primary / Address Book meta merge — those steps can add rows with the same id. */
    const addresses = withPrimaries.filter(
      (a) => !deleted.has(String((a as Record<string, unknown>).id ?? "").toLowerCase())
    );

    return NextResponse.json({ addresses }, noStore);
  } catch (error) {
    console.error("Addresses API error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching addresses" },
      { status: 500 }
    );
  }
}

/** Keys the WordPress secondary-addresses REST API expects (billing2_* / shipping2_*) */
const SECONDARY_ADDRESS_KEYS = [
  "type",
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
  "country",
  "phone",
  "email",
  "ndis_participant_name",
  "ndis_number",
  "ndis_dob",
  "ndis_funding_type",
  "ndis_approval",
  "ndis_invoice_email",
  "hcp_participant_name",
  "hcp_number",
  "hcp_provider_email",
  "hcp_approval",
] as const;

function normalizeAddressBody(body: unknown): Record<string, string> {
  const o =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  const type = o.type === "shipping" ? "shipping" : "billing";
  out.type = type;
  for (const key of SECONDARY_ADDRESS_KEYS) {
    if (key === "type") continue;
    const v = o[key];
    if (key === "ndis_approval" || key === "hcp_approval") {
      out[key] = v === true || v === "1" || v === 1 ? "1" : "0";
    } else {
      out[key] = v != null && typeof v === "string" ? v : String(v ?? "");
    }
  }
  return out;
}

/**
 * POST /api/dashboard/addresses
 * Add a new address (Address Book first = multiple rows; secondary = single billing2/shipping2 slot)
 */
export async function POST(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rawBody = await req.json();
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const { id: userId } = await getWpUserMe(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";
    if (!fileStoreKey) {
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }

    const body = normalizeAddressBody(rawBody);
    const payloadForWp = { ...rawBody, ...body } as Record<string, unknown>;
    if (payloadForWp.type === undefined) payloadForWp.type = body.type;

    /** 1) Multiple addresses — Address Book / Customer Addresses API */
    const bookPost = await fetch(`${wpBase}/wp-json/customers/v1/addresses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadForWp),
      cache: "no-store",
    });

    if (bookPost.ok) {
      const result = await bookPost.json();
      const addr = result.address as Record<string, unknown>;
      const id = String(addr?.id ?? "");
      if (id) {
        upsertAddress(fileStoreKey, id, addr ?? {});
        removeDeletedId(fileStoreKey, id);
      }
      return NextResponse.json({
        address: normalizeAddressFromWp(addr ?? {}, id || `wp-${Date.now()}`),
        message: result.message || "Address added successfully",
      });
    }

    /** 2) Single secondary slot (billing2 / shipping2) */
    const secondaryPost = await fetch(`${wpBase}/wp-json/customers/v1/addresses-secondary`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadForWp),
      cache: "no-store",
    });

    if (secondaryPost.ok) {
      const result = await secondaryPost.json();
      const addr = result.address as Record<string, unknown>;
      const id = String(addr?.id ?? `local-${Date.now()}`);
      upsertAddress(fileStoreKey, id, addr ?? {});
      removeDeletedId(fileStoreKey, id);
      return NextResponse.json({
        address: normalizeAddressFromWp(addr ?? {}, id),
        message: result.message || "Address added successfully",
      });
    }

    const bookErr = await bookPost.text().catch(() => "");
    const secErr = await secondaryPost.text().catch(() => "");
    console.warn(
      "[Addresses] Add failed — address-book:",
      bookPost.status,
      bookErr.slice(0, 120),
      "secondary:",
      secondaryPost.status,
      secErr.slice(0, 120)
    );

    const fallbackId = `local-${Date.now()}`;
    const fallbackAddr: Record<string, unknown> = {
      id: fallbackId,
      type: body.type,
      label: body.type === "shipping" ? "Shipping" : "Billing",
      ...payloadForWp,
    };
    upsertAddress(fileStoreKey, fallbackId, fallbackAddr);
    removeDeletedId(fileStoreKey, fallbackId);

    if (bookPost.status === 404 || bookPost.status === 501 || secondaryPost.status === 404) {
      return NextResponse.json({
        address: normalizeAddressFromWp(fallbackAddr, fallbackId),
        message: "Address saved locally. Enable Address Book or secondary-addresses REST on WordPress to sync.",
      });
    }

    return NextResponse.json({
      address: normalizeAddressFromWp(fallbackAddr, fallbackId),
      message: "Address saved. Check WordPress REST auth for permanent sync.",
    });
  } catch (error) {
    console.error("Add address error:", error);
    return NextResponse.json({ error: "An error occurred while adding address" }, { status: 500 });
  }
}
