import { getWpBaseUrl } from "@/lib/wp-utils";
import type { CheckoutAddress, CheckoutInitiatePayload } from "@/types/checkout";

type LineIn = { product_id: number; variation_id?: number; quantity: number };

function normCountry(c: string | undefined): string {
  const x = String(c || "").trim().toUpperCase();
  if (!x) return "AU";
  if (x === "AUSTRALIA") return "AU";
  return x;
}

function billingToStore(a: CheckoutAddress): Record<string, string> {
  return {
    first_name: a.first_name,
    last_name: a.last_name,
    company: a.company || "",
    address_1: a.address_1,
    address_2: a.address_2 || "",
    city: a.city,
    state: a.state || "",
    postcode: a.postcode,
    country: normCountry(a.country),
    email: a.email || "",
    phone: a.phone || "",
  };
}

function shippingToStore(a: CheckoutAddress): Record<string, string> {
  return {
    first_name: a.first_name,
    last_name: a.last_name,
    company: a.company || "",
    address_1: a.address_1,
    address_2: a.address_2 || "",
    city: a.city,
    state: a.state || "",
    postcode: a.postcode,
    country: normCountry(a.country),
    phone: a.phone || "",
  };
}

type Tokens = { nonce: string; cartToken: string };

/**
 * Woo Store API checkout only accepts block-checkout gateways (e.g. bacs, cheque, cod).
 * Custom `on_account` is not valid; many stores disable BACS—try others when Woo returns
 * `woocommerce_rest_checkout_payment_method_disabled`.
 *
 * `WOO_STORE_ON_ACCOUNT_PAYMENT_METHOD` (optional): first candidate — `cod` | `cheque` | `bacs`.
 */
const STORE_OFFLINE_PLACEHOLDER_METHODS = ["cod", "cheque", "bacs"] as const;

function placeholderCheckoutCandidates(): string[] {
  const env = process.env.WOO_STORE_ON_ACCOUNT_PAYMENT_METHOD?.trim().toLowerCase();
  const out: string[] = [];
  if (
    env &&
    (STORE_OFFLINE_PLACEHOLDER_METHODS as readonly string[]).includes(env)
  ) {
    out.push(env);
  }
  for (const m of STORE_OFFLINE_PLACEHOLDER_METHODS) {
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

function readTokens(res: Response, cur: Tokens): void {
  const n = res.headers.get("Nonce") || res.headers.get("X-WC-Store-API-Nonce") || "";
  const t = res.headers.get("Cart-Token") || "";
  if (n) cur.nonce = n;
  if (t) cur.cartToken = t;
}

function storeHeaders(cookie: string, t: Tokens): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (cookie.trim()) h.Cookie = cookie;
  if (t.nonce) h.Nonce = t.nonce;
  if (t.cartToken) h["Cart-Token"] = t.cartToken;
  return h;
}

/**
 * Headless on-account checkout via WooCommerce Store API (guest cart built server-side).
 * Requires WooCommerce + Store API. Optional: forward browser Cookie for logged-in WP cart sync.
 */
export async function placeOnAccountOrderViaStoreApi(input: {
  cookieHeader: string;
  payload: CheckoutInitiatePayload;
  validatedLineItems: LineIn[];
}): Promise<
  | {
      ok: true;
      order_id: number;
      order_key: string;
      raw: Record<string, unknown>;
    }
  | { ok: false; status: number; message: string; raw?: string }
> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return { ok: false, status: 500, message: "WC_API_URL / WordPress base not configured." };
  }

  const base = `${wpBase.replace(/\/+$/, "")}/wp-json/wc/store/v1`;
  const cookie = input.cookieHeader || "";
  const tokens: Tokens = { nonce: "", cartToken: "" };

  let res = await fetch(`${base}/cart`, {
    method: "GET",
    headers: storeHeaders(cookie, tokens),
    cache: "no-store",
  });
  readTokens(res, tokens);
  if (!res.ok) {
    const raw = await res.text();
    return {
      ok: false,
      status: res.status,
      message: `Store API cart init failed (${res.status}). Is Store API enabled?`,
      raw: raw.slice(0, 1200),
    };
  }

  let cart = (await res.json()) as { items?: Array<{ key?: string }> };
  const items = Array.isArray(cart.items) ? cart.items : [];
  for (const row of items) {
    const key = row.key;
    if (!key) continue;
    res = await fetch(
      `${base}/cart/items/${encodeURIComponent(String(key))}`,
      {
        method: "DELETE",
        headers: storeHeaders(cookie, tokens),
        cache: "no-store",
      }
    );
    readTokens(res, tokens);
    if (!res.ok) {
      const raw = await res.text();
      return {
        ok: false,
        status: res.status,
        message: "Could not clear Woo cart before checkout.",
        raw: raw.slice(0, 800),
      };
    }
  }

  for (const li of input.validatedLineItems) {
    const body: Record<string, unknown> = {
      id: li.product_id,
      quantity: li.quantity,
    };
    if (li.variation_id && li.variation_id > 0) {
      body.variation_id = li.variation_id;
    }
    res = await fetch(`${base}/cart/add-item`, {
      method: "POST",
      headers: storeHeaders(cookie, tokens),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    readTokens(res, tokens);
    if (!res.ok) {
      const raw = await res.text();
      return {
        ok: false,
        status: res.status,
        message: `Store API could not add line item (product ${li.product_id}).`,
        raw: raw.slice(0, 800),
      };
    }
  }

  if (input.payload.coupon_code?.trim()) {
    res = await fetch(`${base}/cart/apply-coupon`, {
      method: "POST",
      headers: storeHeaders(cookie, tokens),
      body: JSON.stringify({ code: input.payload.coupon_code.trim() }),
      cache: "no-store",
    });
    readTokens(res, tokens);
    if (!res.ok) {
      const raw = await res.text();
      return {
        ok: false,
        status: res.status,
        message: "Coupon could not be applied in Woo cart.",
        raw: raw.slice(0, 600),
      };
    }
  }

  res = await fetch(`${base}/cart/select-shipping-rate`, {
    method: "POST",
    headers: storeHeaders(cookie, tokens),
    body: JSON.stringify({
      package_id: 0,
      rate_id: String(input.payload.shipping_method_id || ""),
    }),
    cache: "no-store",
  });
  readTokens(res, tokens);
  if (!res.ok) {
    const raw = await res.text();
    return {
      ok: false,
      status: res.status,
      message: "Could not select shipping method in Woo Store API.",
      raw: raw.slice(0, 800),
    };
  }

  const billing = billingToStore({
    ...input.payload.billing,
    country: normCountry(input.payload.billing.country),
  });
  const shipping = shippingToStore({
    ...input.payload.shipping,
    country: normCountry(input.payload.shipping.country),
  });

  const checkoutBase = {
    billing_address: billing,
    shipping_address: shipping,
    payment_data: [] as unknown[],
    customer_note: "",
    create_account: false,
    extensions: {} as Record<string, unknown>,
  };

  let lastFail: { status: number; message: string; raw: string } | null = null;

  for (const payment_method of placeholderCheckoutCandidates()) {
    res = await fetch(`${base}/checkout`, {
      method: "POST",
      headers: storeHeaders(cookie, tokens),
      body: JSON.stringify({ ...checkoutBase, payment_method }),
      cache: "no-store",
    });
    readTokens(res, tokens);
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {
        ok: false,
        status: res.status,
        message: "Invalid JSON from Store API checkout.",
        raw: text.slice(0, 800),
      };
    }

    if (res.ok) {
      const orderBlock =
        data.order != null &&
        typeof data.order === "object" &&
        !Array.isArray(data.order)
          ? (data.order as Record<string, unknown>)
          : null;
      const oid = Number(
        data.order_id ?? orderBlock?.id ?? data.id ?? orderBlock?.order_id ?? 0
      );
      const okey = String(
        data.order_key ?? orderBlock?.order_key ?? data.key ?? ""
      ).trim();
      if (!Number.isFinite(oid) || oid <= 0 || !okey) {
        return {
          ok: false,
          status: 502,
          message: "Store API checkout succeeded but order_id / order_key missing.",
          raw: text.slice(0, 1200),
        };
      }
      return { ok: true, order_id: oid, order_key: okey, raw: data };
    }

    const code = typeof data.code === "string" ? data.code : "";
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof data.code === "string"
          ? data.code
          : `Store checkout failed (${res.status})`;
    const rawSlice = text.slice(0, 1200);
    lastFail = { status: res.status, message: String(msg), raw: rawSlice };

    const gatewayUnavailable =
      res.status === 400 &&
      code === "woocommerce_rest_checkout_payment_method_disabled";
    if (gatewayUnavailable) {
      console.info("[store-api] checkout placeholder rejected, retrying", {
        payment_method,
        code,
      });
      continue;
    }

    return { ok: false, status: res.status, message: String(msg), raw: rawSlice };
  }

  return {
    ok: false,
    status: lastFail?.status ?? 400,
    message:
      lastFail?.message ??
      "Store checkout failed: no enabled offline payment method (COD / Cheque / BACS) for block checkout.",
    raw: lastFail?.raw,
  };
}
