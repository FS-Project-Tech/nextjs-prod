import "server-only";

import type { NextRequest } from "next/server";
import { getWCSessionHeaders } from "@/lib/woocommerce-session";
import type { CartItem } from "@/lib/types/cart";
import type { WooCommerceCartData, WooCommerceCartLineForSync } from "@/lib/woo-rest-server";
import { wcGet } from "@/lib/woocommerce/wc-fetch";

function storeApiOrigin(): string {
  const raw = process.env.WC_API_URL || "";
  const origin = raw.replace(/\/wp-json\/wc\/v3\/?$/i, "").replace(/\/+$/, "");
  if (!origin) throw new Error("WC_API_URL not configured");
  return origin;
}

export type StoreCartJson = {
  items?: Array<{
    key?: string;
    id?: number | string;
    quantity?: number;
    name?: string;
    prices?: { price?: string; sale_price?: string; regular_price?: string };
    images?: Array<{ src?: string; alt?: string }>;
    variation?: unknown[];
  }>;
  totals?: Record<string, string | number | undefined>;
  coupon_lines?: Array<{ code?: string; discount?: string }>;
  shipping_rates?: unknown[];
};

/** Nonce + raw cart after sync — required for checkout so GET /cart without Nonce does not open a new empty session. */
export type StoreSessionAfterSync = {
  cartData: WooCommerceCartData;
  nonce: string;
  rawCart: StoreCartJson;
};

/**
 * WooCommerce Store API returns a fresh nonce on cart responses; POST /cart/* requires header `Nonce`.
 * @see https://developer.woocommerce.com/docs/apis/store-api/nonce-tokens/
 */
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

async function storeHeaders(req: NextRequest, nonce?: string | null): Promise<Record<string, string>> {
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
    // Older WooCommerce builds expected this name; harmless if ignored.
    h["X-WC-Store-API-Nonce"] = nonce;
  }
  return h;
}

async function readStoreCart(
  req: NextRequest,
  nonce?: string | null,
): Promise<{ cart: StoreCartJson; nonce: string | null }> {
  const res = await fetch(`${storeApiOrigin()}/wp-json/wc/store/v1/cart`, {
    method: "GET",
    headers: await storeHeaders(req, nonce),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Store cart GET failed (${res.status})`);
  }
  const cart = (await res.json()) as StoreCartJson;
  const nextNonce = extractStoreApiNonce(res) ?? nonce ?? null;
  return { cart, nonce: nextNonce };
}

async function storePost(
  req: NextRequest,
  path: string,
  body: unknown,
  nonce: string,
): Promise<{ res: Response; nonce: string }> {
  const headers = await storeHeaders(req, nonce);
  const res = await fetch(`${storeApiOrigin()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const nextNonce = extractStoreApiNonce(res) ?? nonce;
  return { res, nonce: nextNonce };
}

async function storeDelete(
  req: NextRequest,
  path: string,
  nonce: string,
): Promise<{ res: Response; nonce: string }> {
  const headers = await storeHeaders(req, nonce);
  const res = await fetch(`${storeApiOrigin()}${path}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  const nextNonce = extractStoreApiNonce(res) ?? nonce;
  return { res, nonce: nextNonce };
}

/** UI-only keys — not valid Woo variation attributes for Store API add-item. */
const STORE_VARIATION_SKIP_KEYS = new Set(["Available Unit Options"]);

function cartAttributesToStoreVariation(
  attrs: Record<string, string> | undefined,
): Array<{ attribute: string; value: string }> {
  if (!attrs) return [];
  return Object.entries(attrs)
    .filter(([k, v]) => k.trim() && String(v).trim() && !STORE_VARIATION_SKIP_KEYS.has(k))
    .map(([attribute, value]) => ({ attribute, value: String(value) }));
}

/**
 * Store API add-item requires a `variation` array for variable products.
 * @see https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/cart/#add-item
 */
async function buildStoreApiAddItemBodyFromParts(parts: {
  productId: number;
  variationId?: number;
  quantity: number;
  attributes?: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const productOrVariationId =
    parts.variationId && parts.variationId > 0 ? parts.variationId : parts.productId;
  const body: Record<string, unknown> = {
    id: productOrVariationId,
    quantity: parts.quantity,
  };

  if (!parts.variationId || parts.variationId <= 0) {
    return body;
  }

  let variation = cartAttributesToStoreVariation(parts.attributes);
  if (variation.length === 0 && parts.productId > 0) {
    try {
      const { data } = await wcGet<{
        attributes?: Array<{ name?: string; option?: string }>;
      }>(`/products/${parts.productId}/variations/${parts.variationId}`, undefined, "noStore");
      const attrs = data?.attributes;
      if (Array.isArray(attrs)) {
        variation = attrs
          .filter((a) => a.name && a.option)
          .map((a) => ({ attribute: String(a.name), value: String(a.option) }));
      }
    } catch {
      /* WC REST optional; add-item may still work or return a clear error */
    }
  }

  if (variation.length > 0) {
    body.variation = variation;
  }

  return body;
}

async function buildStoreApiAddItemBody(line: CartItem): Promise<Record<string, unknown>> {
  const base = await buildStoreApiAddItemBodyFromParts({
    productId: line.productId,
    variationId: line.variationId,
    quantity: line.qty,
    attributes: line.attributes,
  });
  const data = line.cartItemData;
  if (data && Object.keys(data).length > 0) {
    return { ...base, cart_item_data: { ...data } };
  }
  return base;
}

function storeLineMatchesRequestedLine(
  si: NonNullable<StoreCartJson["items"]>[number],
  req: CartItem,
): boolean {
  const sid = Number(si.id);
  if (!Number.isFinite(sid)) return false;
  if (req.variationId && req.variationId > 0) {
    return sid === req.variationId;
  }
  return sid === req.productId;
}

function mapStoreCartToClientShape(
  cart: StoreCartJson,
  requestedLines: CartItem[],
): WooCommerceCartData {
  const storeLines = Array.isArray(cart.items) ? [...cart.items] : [];
  const used = new Set<number>();
  const coupon_lines = Array.isArray(cart.coupon_lines)
    ? cart.coupon_lines.map((c) => ({
        code: String(c.code || ""),
        discount: String(c.discount || ""),
      }))
    : [];

  const totals = cart.totals || {};
  const totalItems = String(totals.total_items ?? totals.total_price ?? "0");
  const totalPrice = String(totals.total_price ?? "0");
  const totalTax = String(totals.total_tax ?? "0");
  const shipping = String(totals.total_shipping ?? "0");
  const discount = String(totals.total_discount ?? "0");

  const items: WooCommerceCartLineForSync[] = requestedLines.map((req) => {
    let idx = -1;
    if (req.wc_store_item_key) {
      idx = storeLines.findIndex(
        (s, i) => !used.has(i) && s.key && s.key === req.wc_store_item_key,
      );
    }
    if (idx < 0) {
      idx = storeLines.findIndex((s, i) => !used.has(i) && storeLineMatchesRequestedLine(s, req));
    }
    if (idx >= 0) used.add(idx);
    const si = idx >= 0 ? storeLines[idx] : undefined;
    const priceStr =
      si?.prices?.price || si?.prices?.sale_price || si?.prices?.regular_price || req.price;
    const img = si?.images?.[0];
    return {
      id: req.id,
      product_id: req.productId,
      variation_id: req.variationId,
      quantity: si?.quantity ?? req.qty,
      name: si?.name || req.name,
      price: String(priceStr),
      sku: req.sku ?? undefined,
      image: img?.src ? { src: img.src, alt: img.alt || req.name } : undefined,
      wc_store_item_key: si?.key,
    };
  });

  return {
    items,
    subtotal: totalItems || "0",
    total: totalPrice || "0",
    tax_total: totalTax,
    shipping_total: shipping,
    discount_total: discount,
    coupon_lines,
  };
}

/**
 * DELETE /wc/store/v1/cart/items/:key then GET /cart.
 * If `key` is omitted, resolves the first Store API line matching productId / variationId.
 */
export async function removeLineFromStoreApi(
  req: NextRequest,
  params: {
    key?: string;
    productId?: number;
    variationId?: number;
  },
): Promise<StoreCartJson> {
  let { cart, nonce } = await readStoreCart(req, null);
  if (!nonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce header on GET /cart. " +
        "Cart mutations require it. If you use a reverse proxy, allow the Nonce response header through.",
    );
  }

  let key = params.key?.trim() || undefined;
  if (!key) {
    const productId = params.productId;
    if (productId == null || !Number.isFinite(productId) || productId <= 0) {
      throw new Error("Provide wc_store_item_key or a valid productId to remove a cart line.");
    }
    const variationId = params.variationId && params.variationId > 0 ? params.variationId : undefined;
    for (const line of cart.items || []) {
      if (!line.key) continue;
      const sid = Number(line.id);
      if (!Number.isFinite(sid)) continue;
      if (variationId != null) {
        if (sid === variationId) {
          key = line.key;
          break;
        }
      } else if (sid === productId) {
        key = line.key;
        break;
      }
    }
  }

  if (!key) {
    const itemCount = Array.isArray(cart.items) ? cart.items.length : 0;
    if (itemCount === 0) {
      return cart;
    }
    throw new Error(
      "Could not resolve Store API cart item key for removal. The session cart has items but none match this product/variation (check variationId / productId).",
    );
  }

  const { res, nonce: nonceAfterDelete } = await storeDelete(
    req,
    `/wp-json/wc/store/v1/cart/items/${encodeURIComponent(key)}`,
    nonce,
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `DELETE cart item failed (${res.status})`);
  }

  const { cart: after } = await readStoreCart(req, nonceAfterDelete);
  return after;
}

/** DELETE /wc/store/v1/cart/items (clear all) then GET /cart. Returns nonce required for subsequent add-item calls. */
export async function emptyStoreCart(req: NextRequest): Promise<{
  cart: StoreCartJson;
  nonce: string;
}> {
  let { nonce } = await readStoreCart(req, null);
  if (!nonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce header on GET /cart. " +
        "Cart mutations require it. If you use a reverse proxy, allow the Nonce response header through.",
    );
  }
  const { res, nonce: n2 } = await storeDelete(req, "/wp-json/wc/store/v1/cart/items", nonce);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `DELETE all cart items failed (${res.status})`);
  }
  const { cart: after, nonce: n3 } = await readStoreCart(req, n2);
  const effectiveNonce = (n3 ?? n2)?.trim() || "";
  if (!effectiveNonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce after clearing the cart. Check Nonce headers on your proxy.",
    );
  }
  return { cart: after, nonce: effectiveNonce };
}

/**
 * Headless “push” model: empty the Store API cart, then re-add every line from the client snapshot.
 * Does **not** mutate client state — caller owns Zustand as source of truth.
 */
export async function pushClientCartToWooSession(
  req: NextRequest,
  items: CartItem[],
  couponCode?: string,
): Promise<{ lineCount: number; rawCart: StoreCartJson; nonce: string }> {
  const { cart: clearedCart, nonce: nonceAfterClear } = await emptyStoreCart(req);
  let nonce = nonceAfterClear;

  if (items.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.log("[pushClientCartToWooSession] empty client cart → Woo cleared", {
        wooLineCount: Array.isArray(clearedCart.items) ? clearedCart.items.length : 0,
      });
    }
    return {
      lineCount: 0,
      rawCart: clearedCart,
      nonce,
    };
  }

  let lastCartFromAdd: StoreCartJson | null = null;
  let lastAddStatus = 0;
  for (const line of items) {
    const addBody = await buildStoreApiAddItemBody(line);
    const { res: add, nonce: nAfterAdd } = await storePost(
      req,
      "/wp-json/wc/store/v1/cart/add-item",
      addBody,
      nonce,
    );
    nonce = nAfterAdd;
    lastAddStatus = add.status;
    const addText = await add.text();
    if (!add.ok) {
      throw new Error(addText || `add-item failed (${add.status})`);
    }
    try {
      lastCartFromAdd = JSON.parse(addText) as StoreCartJson;
    } catch {
      lastCartFromAdd = null;
    }
  }

  if (couponCode?.trim()) {
    const { res: applied, nonce: nAfterCoupon } = await storePost(
      req,
      "/wp-json/wc/store/v1/cart/apply-coupon",
      { code: couponCode.trim() },
      nonce,
    );
    nonce = nAfterCoupon;
    if (!applied.ok) {
      const errText = await applied.text();
      throw new Error(errText || `apply-coupon failed (${applied.status})`);
    }
  }

  const { cart: finalCartFromGet, nonce: nonceAfterFinalRead } = await readStoreCart(req, nonce);
  const effectiveNonce = nonceAfterFinalRead ?? nonce;
  if (!effectiveNonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce after syncing the cart. Check Nonce headers on your proxy.",
    );
  }

  const getCount = Array.isArray(finalCartFromGet.items) ? finalCartFromGet.items.length : 0;
  const addCount = lastCartFromAdd?.items?.length ?? 0;
  const finalCart =
    getCount === 0 && addCount > 0 && lastCartFromAdd ? lastCartFromAdd : finalCartFromGet;

  const lineCount = Array.isArray(finalCart.items) ? finalCart.items.length : 0;
  if (lineCount === 0) {
    throw new Error(
      "WooCommerce cart has no line items after sync. For variable products, ensure `variation` attributes are sent (Store API requires them). " +
        `Last add-item HTTP ${lastAddStatus}. Verify product/variation IDs, cookies/session, and Store API permissions.`,
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[pushClientCartToWooSession] pushed", {
      clientLines: items.length,
      wooLineCount: lineCount,
    });
  }

  return {
    lineCount,
    rawCart: finalCart,
    nonce: effectiveNonce,
  };
}

/**
 * Syncs the Store API cart and returns the **nonce + raw cart** from the final GET.
 * Checkout must reuse this nonce; a fresh GET /cart without `Nonce` can bind to a new empty session.
 */
export async function syncCartViaStoreApiWithSession(
  req: NextRequest,
  items: CartItem[],
  couponCode?: string,
): Promise<StoreSessionAfterSync> {
  if (items.length === 0) {
    throw new Error("syncCartViaStoreApiWithSession requires a non-empty items array.");
  }

  const { rawCart, nonce, lineCount } = await pushClientCartToWooSession(req, items, couponCode);
  if (lineCount === 0) {
    throw new Error(
      "WooCommerce cart has no line items after sync. Verify product/variation IDs and Store API permissions.",
    );
  }

  return {
    cartData: mapStoreCartToClientShape(rawCart, items),
    nonce,
    rawCart,
  };
}

export async function syncCartViaStoreApi(
  req: NextRequest,
  items: CartItem[],
  couponCode?: string,
): Promise<WooCommerceCartData> {
  if (items.length === 0) {
    return {
      items: [],
      subtotal: "0",
      total: "0",
      tax_total: "0",
      shipping_total: "0",
      discount_total: "0",
      coupon_lines: [],
    };
  }

  const { cartData } = await syncCartViaStoreApiWithSession(req, items, couponCode);
  return cartData;
}

export type StoreApiAddLineItemParams = {
  /** Product or variation ID passed to Store API `id`. */
  id: number;
  quantity: number;
  /** Parent product ID (used with `variation_id` to load variation attributes for Store API). */
  product_id?: number;
  /** When set, builds required Store API `variation` payload from attributes or WC REST. */
  variation_id?: number;
  /** Attribute labels → values (e.g. from PDP); merged into Store API `variation`. */
  attributes?: Record<string, string>;
  /** Woo session cart item data (`bulk_uom`, `bulk_multiplier`, …). */
  cart_item_data?: Record<string, string | number>;
  /** Optional mirror for custom Store API / PHP filters that read `meta_data`. */
  meta_data?: Array<{ key: string; value: unknown }>;
};

/**
 * POST `/cart/add-item` with nonce from GET `/cart`. Sends `cart_item_data` and optional `meta_data`.
 * Woo may require a small `woocommerce_store_api_add_to_cart_data` filter to merge extras into the cart line.
 */
export async function storeApiAddLineItem(
  req: NextRequest,
  params: StoreApiAddLineItemParams,
): Promise<{ ok: true; cart: unknown } | { ok: false; status: number; body: string }> {
  let { nonce } = await readStoreCart(req, null);
  if (!nonce) {
    return { ok: false, status: 500, body: "Store API did not return a Nonce. Check GET /cart headers." };
  }

  const hasVar = Boolean(params.variation_id && params.variation_id > 0);
  const parentProductId =
    hasVar && params.product_id && params.product_id > 0 ? params.product_id : params.id;

  const base = await buildStoreApiAddItemBodyFromParts({
    productId: parentProductId,
    variationId: hasVar ? params.variation_id : undefined,
    quantity: params.quantity,
    attributes: params.attributes,
  });

  const body: Record<string, unknown> = { ...base, id: params.id, quantity: params.quantity };
  if (params.cart_item_data && Object.keys(params.cart_item_data).length > 0) {
    body.cart_item_data = params.cart_item_data;
  }
  if (params.meta_data && params.meta_data.length > 0) {
    body.meta_data = params.meta_data;
  }

  const { res } = await storePost(req, "/wp-json/wc/store/v1/cart/add-item", body, nonce);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, body: text || `add-item failed (${res.status})` };
  }
  const cart = await res.json();
  return { ok: true, cart };
}
