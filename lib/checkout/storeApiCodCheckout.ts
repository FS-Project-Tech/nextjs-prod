import "server-only";

import type { NextRequest } from "next/server";
import { getWCSessionHeaders } from "@/lib/woocommerce-session";
import type { CheckoutInitiatePayload } from "@/types/checkout";

export function storeCheckoutApiOrigin(): string {
  const raw = process.env.WC_API_URL || "";
  const origin = raw.replace(/\/wp-json\/wc\/v3\/?$/i, "").replace(/\/+$/, "");
  if (!origin) throw new Error("WC_API_URL not configured");
  return origin;
}

function extractStoreApiNonce(res: Response): string | null {
  const direct =
    res.headers.get("Nonce")?.trim() ||
    res.headers.get("nonce")?.trim() ||
    res.headers.get("X-WC-Store-API-Nonce")?.trim() ||
    res.headers.get("x-wc-store-api-nonce")?.trim();
  if (direct) return direct;
  for (const [key, value] of res.headers.entries()) {
    const k = key.toLowerCase();
    if ((k === "nonce" || k === "x-wc-store-api-nonce") && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function forwardHeaders(
  req: NextRequest,
  nonce: string | null,
): Promise<Record<string, string>> {
  const session = await getWCSessionHeaders();
  const cookie = req.headers.get("cookie") || "";
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (cookie) h.Cookie = cookie;
  if (session["X-WC-Session"]) h["X-WC-Session"] = session["X-WC-Session"];
  if (nonce) {
    h.Nonce = nonce;
    h["X-WC-Store-API-Nonce"] = nonce;
  }
  return h;
}

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

export function buildStoreCheckoutAddresses(payload: CheckoutInitiatePayload): {
  billing_address: Record<string, string>;
  shipping_address: Record<string, string>;
} {
  const billing_address = {
    first_name: payload.billing.first_name,
    last_name: payload.billing.last_name,
    company: payload.billing.company || "",
    address_1: payload.billing.address_1,
    address_2: payload.billing.address_2 || "",
    city: payload.billing.city,
    state: payload.billing.state || "",
    postcode: payload.billing.postcode,
    country: normalizeCountry(payload.billing.country),
    email: payload.billing.email || "",
    phone: payload.billing.phone || "",
  };
  const shipping_address = {
    first_name: payload.shipping.first_name,
    last_name: payload.shipping.last_name,
    company: payload.shipping.company || "",
    address_1: payload.shipping.address_1,
    address_2: payload.shipping.address_2 || "",
    city: payload.shipping.city,
    state: payload.shipping.state || "",
    postcode: payload.shipping.postcode,
    country: normalizeCountry(payload.shipping.country),
  };
  return { billing_address, shipping_address };
}

type CartJson = Record<string, unknown>;

function findShippingSelection(
  cart: CartJson,
  selectedShippingMethodId: string,
): { package_id: number; rate_id: string } | null {
  const packages = cart.shipping_rates;
  if (!Array.isArray(packages)) return null;
  const want = String(selectedShippingMethodId).trim();
  if (!want) return null;

  for (const pkg of packages) {
    const p = pkg as { package_id?: number; shipping_rates?: unknown[] };
    const rates = p.shipping_rates;
    if (!Array.isArray(rates)) continue;
    for (const rate of rates) {
      const r = rate as { rate_id?: string; id?: string; method_id?: string };
      const rid = (r.rate_id || r.id) as string | undefined;
      if (!rid) continue;
      if (rid === want || String(rid) === want) {
        return {
          package_id: typeof p.package_id === "number" ? p.package_id : 0,
          rate_id: String(rid),
        };
      }
      if (r.method_id && `${r.method_id}` === want) {
        return {
          package_id: typeof p.package_id === "number" ? p.package_id : 0,
          rate_id: String(rid),
        };
      }
    }
  }
  return null;
}

export type StoreApiCodResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  json: Record<string, unknown> | null;
  durationMs: number;
};

export function messageFromStoreApiError(
  json: Record<string, unknown> | null,
  bodyText: string,
): string {
  if (json) {
    const m = json.message;
    if (typeof m === "string" && m.trim()) return m.trim();
    const data = json.data;
    if (data != null && typeof data === "object" && "message" in data) {
      const dm = (data as { message?: unknown }).message;
      if (typeof dm === "string" && dm.trim()) return dm.trim();
    }
    const c = json.code;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const t = bodyText.trim();
  if (t.length > 0 && t.length < 800) return t;
  return "Checkout request failed.";
}

/**
 * Single headless path: Woo Store API cart (session) → optional select-shipping-rate → POST checkout.
 * Caller supplies AbortSignal for a hard deadline (e.g. 12s) across all hops.
 *
 * **Always pass `cartSession`** from {@link syncCartViaStoreApiWithSession} after server-side sync.
 * A bare GET /cart without the post-sync `Nonce` can start a new empty Store API session.
 */
export async function runStoreApiCodPlaceOrder(opts: {
  req: NextRequest;
  payload: CheckoutInitiatePayload;
  signal: AbortSignal;
  cartSession?: { nonce: string; cartJson: CartJson };
}): Promise<StoreApiCodResult> {
  const { req, payload, signal, cartSession } = opts;
  const origin = storeCheckoutApiOrigin();
  const t0 = Date.now();

  let nonce: string;
  let cartJson: CartJson;

  if (cartSession?.nonce?.trim() && cartSession.cartJson != null) {
    nonce = cartSession.nonce.trim();
    cartJson = cartSession.cartJson;
    const seededItems = cartJson.items;
    if (!Array.isArray(seededItems) || seededItems.length === 0) {
      return {
        ok: false,
        status: 400,
        bodyText:
          "WooCommerce session cart is empty. Sync did not return line items — check product/variation IDs and Store API.",
        json: null,
        durationMs: Date.now() - t0,
      };
    }
  } else {
    const headersNoNonce = await forwardHeaders(req, null);
    const cartRes = await fetch(`${origin}/wp-json/wc/store/v1/cart`, {
      method: "GET",
      headers: headersNoNonce,
      signal,
      cache: "no-store",
    });

    if (!cartRes.ok) {
      const bodyText = await cartRes.text();
      return {
        ok: false,
        status: cartRes.status,
        bodyText,
        json: null,
        durationMs: Date.now() - t0,
      };
    }

    const extracted = extractStoreApiNonce(cartRes);
    if (!extracted) {
      return {
        ok: false,
        status: 502,
        bodyText:
          "WooCommerce Store API did not return a Nonce header. Ensure your proxy forwards the Nonce response header.",
        json: null,
        durationMs: Date.now() - t0,
      };
    }
    nonce = extracted;

    try {
      cartJson = (await cartRes.json()) as CartJson;
    } catch {
      return {
        ok: false,
        status: 502,
        bodyText: "Invalid JSON from GET /cart",
        json: null,
        durationMs: Date.now() - t0,
      };
    }

    const items = cartJson.items;
    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: false,
        status: 400,
        bodyText:
          "WooCommerce session cart is empty. Use server-side cart sync and pass cartSession (nonce + cart) into checkout.",
        json: null,
        durationMs: Date.now() - t0,
      };
    }
  }

  let headers = await forwardHeaders(req, nonce);
  const selection = findShippingSelection(cartJson, payload.shipping_method_id);
  if (selection) {
    const selRes = await fetch(`${origin}/wp-json/wc/store/v1/cart/select-shipping-rate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        package_id: selection.package_id,
        rate_id: selection.rate_id,
      }),
      signal,
      cache: "no-store",
    });
    nonce = extractStoreApiNonce(selRes) ?? nonce;
    if (!selRes.ok) {
      const errT = await selRes.text();
      let j: Record<string, unknown> | null = null;
      try {
        j = errT ? (JSON.parse(errT) as Record<string, unknown>) : null;
      } catch {
        j = null;
      }
      return {
        ok: false,
        status: selRes.status,
        bodyText: errT,
        json: j,
        durationMs: Date.now() - t0,
      };
    }
    headers = await forwardHeaders(req, nonce);
  }

  const { billing_address, shipping_address } = buildStoreCheckoutAddresses(payload);
  const checkoutBody: Record<string, unknown> = {
    billing_address,
    shipping_address,
    payment_method: "cod",
    payment_data: [],
    customer_note: "",
  };

  if (payload.ndis_type?.trim() || payload.insurance_option) {
    checkoutBody.extensions = {
      headless_checkout: {
        ...(payload.ndis_type?.trim() ? { ndis_type: payload.ndis_type.trim() } : {}),
        ...(payload.insurance_option ? { insurance_option: payload.insurance_option } : {}),
      },
    };
  }

  const checkoutRes = await fetch(`${origin}/wp-json/wc/store/v1/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(checkoutBody),
    signal,
    cache: "no-store",
  });

  const bodyText = await checkoutRes.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  return {
    ok: checkoutRes.ok,
    status: checkoutRes.status,
    bodyText,
    json,
    durationMs: Date.now() - t0,
  };
}
