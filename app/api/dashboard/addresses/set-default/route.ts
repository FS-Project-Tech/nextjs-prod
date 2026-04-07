import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getWpBaseUrl } from "@/lib/auth";
import { getCustomerData } from "@/lib/customer";
import wcAPI from "@/lib/woocommerce";

/** joya_ha_* saved-address id (12 hex) — syncs WP user meta billing_* / shipping_* via WordPress REST */
const JOYA_BOOK_ID = /^[a-fA-F0-9]{12}$/;

async function bearerEmail(token: string): Promise<string> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return "";
  const res = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const u = await res.json().catch(() => null);
  return String(u?.email ?? "").trim();
}

/**
 * POST /api/dashboard/addresses/set-default
 * Copies the chosen row into WooCommerce customer `billing` or `shipping` and mirrors WP user meta for wp-admin.
 */
export async function POST(req: NextRequest) {
  const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = (nextAuthToken as any)?.wpToken;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type === "shipping" ? "shipping" : "billing";

  const keys = [
    "first_name",
    "last_name",
    "company",
    "address_1",
    "address_2",
    "city",
    "state",
    "postcode",
    "country",
    "email",
    "phone",
  ] as const;
  const addressBlock: Record<string, string> = {};
  for (const k of keys) {
    const v = body[k];
    addressBlock[k] = v != null && typeof v !== "object" ? String(v) : "";
  }

  const email = await bearerEmail(token);
  if (!email) {
    return NextResponse.json({ error: "Could not resolve user email" }, { status: 400 });
  }

  const customer = await getCustomerData(email, token);
  const cid = customer?.id != null ? Number(customer.id) : NaN;
  if (!customer || !Number.isFinite(cid) || cid <= 0) {
    return NextResponse.json({ error: "WooCommerce customer not found" }, { status: 404 });
  }

  const wcPayload =
    type === "shipping" ? { shipping: addressBlock } : { billing: addressBlock };

  try {
    await wcAPI.put(`/customers/${cid}`, wcPayload);
  } catch (e) {
    console.error("[addresses/set-default] WooCommerce update failed:", e);
    return NextResponse.json(
      {
        error:
          type === "shipping"
            ? "Failed to set default shipping in WooCommerce"
            : "Failed to set default billing in WooCommerce",
      },
      { status: 502 }
    );
  }

  const rawSourceId = body.sourceAddressId ?? body.addressId;
  const sourceId =
    rawSourceId != null && typeof rawSourceId === "string" && JOYA_BOOK_ID.test(rawSourceId.trim())
      ? rawSourceId.trim().toLowerCase()
      : null;
  const wpBase = getWpBaseUrl();
  if (sourceId && wpBase) {
    const path =
      type === "shipping"
        ? `addresses/${encodeURIComponent(sourceId)}/apply-as-primary-shipping`
        : `addresses/${encodeURIComponent(sourceId)}/apply-as-primary-billing`;
    const sync = await fetch(`${wpBase}/wp-json/customers/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!sync.ok && process.env.NODE_ENV === "development") {
      const t = await sync.text().catch(() => "");
      console.warn(
        `[addresses/set-default] WP ${type === "shipping" ? "shipping_*" : "billing_*"} sync:`,
        sync.status,
        t.slice(0, 200)
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      type === "shipping"
        ? "Default shipping address updated for checkout"
        : "Default billing address updated for checkout",
  });
}
