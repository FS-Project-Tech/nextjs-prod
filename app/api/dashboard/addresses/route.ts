import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import {
  getAddresses,
  addAddress,
  getDeletedIds,
  upsertAddress,
  addDeletedId,
  removeDeletedId,
} from "@/lib/addresses-memory-store";
import { loadFromFile } from "@/lib/addresses-file-store";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";
import { getToken } from "next-auth/jwt";

async function getUserId(token: string): Promise<string | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;
  const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  return user?.id != null ? String(user.id) : (user?.slug ?? null);
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

    const userId = await getUserId(token);
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

    // Prefer secondary addresses (billing2 / shipping2) so dashboard Addresses page syncs with WP "Customer Billing/Shipping Address (Secondary)"
    const secondaryResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses-secondary`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (process.env.NODE_ENV === "development") {
      console.log("[addresses] GET secondary status:", secondaryResponse.status);
    }
    if (secondaryResponse.ok) {
      const data = await secondaryResponse.json();
      const wpList = data.addresses || [];
      const fallbackList = getFallbackAddresses(fileStoreKey);
      const deleted = getDeletedIds(fileStoreKey);
      const byId = new Map<string, Record<string, unknown>>();
      for (const a of wpList) {
        const raw = a as Record<string, unknown>;
        const id = String(raw.id ?? "");
        byId.set(id, normalizeAddressFromWp(raw, id));
      }
      for (const a of fallbackList) {
        const id = String(a.id);
        if (!byId.has(id)) {
          byId.set(id, normalizeAddressFromWp(a as Record<string, unknown>, id));
        }
      }
      const merged = Array.from(byId.values()).filter(
        (a) => !deleted.has(String(a.id).toLowerCase())
      );
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[addresses] GET (secondary) wp:",
          wpList.length,
          "fallback:",
          fallbackList.length,
          "merged:",
          merged.length
        );
      }
      return NextResponse.json({ addresses: merged }, noStore);
    }

    // Fallback: primary addresses endpoint (e.g. Address Book for WooCommerce)
    const addressesResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (process.env.NODE_ENV === "development") {
      console.log("[addresses] GET primary status:", addressesResponse.status);
    }
    if (addressesResponse.ok) {
      const data = await addressesResponse.json();
      const wpList = data.addresses || [];
      const fallbackList = getFallbackAddresses(fileStoreKey);
      const deleted = getDeletedIds(fileStoreKey);
      const byId = new Map<string, Record<string, unknown>>();
      for (const a of wpList) {
        const raw = a as Record<string, unknown>;
        const id = String(raw.id ?? "");
        byId.set(id, normalizeAddressFromWp(raw, id));
      }
      for (const a of fallbackList) {
        const id = String(a.id);
        if (!byId.has(id)) {
          byId.set(id, normalizeAddressFromWp(a as Record<string, unknown>, id));
        }
      }
      const merged = Array.from(byId.values()).filter(
        (a) => !deleted.has(String(a.id).toLowerCase())
      );
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[addresses] GET (primary) wp:",
          wpList.length,
          "fallback:",
          fallbackList.length,
          "merged:",
          merged.length
        );
      }
      return NextResponse.json({ addresses: merged }, noStore);
    }

    if (addressesResponse.status === 404) {
      const list = getFallbackAddresses(fileStoreKey);
      const deleted = getDeletedIds(fileStoreKey);
      const filtered = list.filter((a) => !deleted.has(String(a.id).toLowerCase()));
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[addresses] GET (404 fallback) list:",
          list.length,
          "filtered:",
          filtered.length
        );
      }
      return NextResponse.json({ addresses: filtered }, noStore);
    }

    // Both WordPress endpoints failed (e.g. 401 auth or 404). Return file-store addresses so they persist after refresh.
    const list = getFallbackAddresses(fileStoreKey);
    const deleted = getDeletedIds(fileStoreKey);
    const filtered = list.filter((a) => !deleted.has(String(a.id).toLowerCase()));
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[addresses] GET (fallback – WP not ok) secondary:",
        secondaryResponse.status,
        "primary:",
        addressesResponse.status,
        "list:",
        filtered.length
      );
    }
    return NextResponse.json({ addresses: filtered }, noStore);
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
 * Add a new address (uses WordPress endpoint if available, otherwise in-memory fallback)
 */
// export async function POST(req: NextRequest) {
//   try {
//     const token = await getAuthToken();
//     if (!token) {
//       return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
//     }
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

    const userId = await getUserId(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";
    if (!fileStoreKey) {
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }

    // Send normalized body so WordPress secondary API always gets expected keys (first_name, address_1, etc.)
    const body = normalizeAddressBody(rawBody);
    const payloadForWp = { ...rawBody, ...body } as Record<string, unknown>;
    if (payloadForWp.type === undefined) payloadForWp.type = body.type;

    // Prefer secondary (billing2/shipping2) so dashboard Addresses page stores in WP "Customer Billing/Shipping Address (Secondary)"
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
      // Persist to file using same key as GET (token.sub) so address survives refresh
      upsertAddress(fileStoreKey, id, addr ?? {});
      removeDeletedId(fileStoreKey, id);
      return NextResponse.json({
        address: normalizeAddressFromWp(addr ?? {}, id),
        message: result.message || "Address added successfully",
      });
    }

    // Log so you can see why address did not store in backend (404 = route not added in WP, 401 = REST auth not set up)
    const errText = await secondaryPost.text();
    console.warn(
      `[Addresses] Secondary endpoint returned ${secondaryPost.status}. Address may not be stored in WordPress. ` +
        (secondaryPost.status === 404
          ? "Add the REST API from docs/wordpress-secondary-addresses-rest-api.php to your theme."
          : secondaryPost.status === 401
            ? "Ensure WordPress authenticates REST requests (e.g. JWT or Application Passwords) so the user is set for this route."
            : ""),
      errText.slice(0, 200)
    );

    // When WordPress returns 401/404, still save to file store so address persists after refresh
    const fallbackId = `local-${Date.now()}`;

    const fallbackAddr: Record<string, unknown> = {
      id: fallbackId,
      type: body.type,
      label: body.type === "shipping" ? "Shipping" : "Billing",
      ...payloadForWp,
    };
    upsertAddress(fileStoreKey, fallbackId, fallbackAddr);
    removeDeletedId(fileStoreKey, fallbackId);

    const addResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadForWp),
      cache: "no-store",
    });

    if (addResponse.ok) {
      const result = await addResponse.json();
      const addr = result.address as Record<string, unknown>;
      const id = String(addr?.id ?? "");
      // Persist to file using same key as GET so address survives refresh
      if (id) upsertAddress(fileStoreKey, id, addr ?? {});
      removeDeletedId(fileStoreKey, id); // ADD THIS
      return NextResponse.json({
        address: normalizeAddressFromWp(addr ?? {}, id),
        message: result.message || "Address added successfully",
      });
    }

    if (addResponse.status === 404 || addResponse.status === 501) {
      // Address already saved to file store above; return it so it persists after refresh
      return NextResponse.json({
        address: normalizeAddressFromWp(fallbackAddr, fallbackId),
        message: "Address added successfully",
      });
    }

    // Primary also failed (e.g. 401); still return success with the address we saved to file so it persists after refresh
    return NextResponse.json({
      address: normalizeAddressFromWp(fallbackAddr, fallbackId),
      message: "Address saved. Enable WordPress REST auth (JWT plugin) to sync to Edit User.",
    });
  } catch (error) {
    console.error("Add address error:", error);
    return NextResponse.json({ error: "An error occurred while adding address" }, { status: 500 });
  }
}
