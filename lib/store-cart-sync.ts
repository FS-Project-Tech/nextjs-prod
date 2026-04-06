import "server-only";

import type { NextRequest } from "next/server";
import { getWCSessionHeaders } from "@/lib/woocommerce-session";
import type { CartItem } from "@/lib/types/cart";
import type { WooCommerceCartData, WooCommerceCartLineForSync } from "@/lib/woo-rest-server";

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

function mapStoreCartToClientShape(
  cart: StoreCartJson,
  requestedLines: CartItem[],
): WooCommerceCartData {
  const storeLines = Array.isArray(cart.items) ? cart.items : [];
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

  const items: WooCommerceCartLineForSync[] = requestedLines.map((req, index) => {
    const si = storeLines[index];
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

  let { cart: current, nonce } = await readStoreCart(req, null);

  if (!nonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce header on GET /cart. " +
        "Cart mutations require it. If you use a reverse proxy, allow the Nonce response header through.",
    );
  }

  for (const line of current.items || []) {
    if (!line.key) continue;
    const { res: rm, nonce: nAfterRm } = await storePost(
      req,
      "/wp-json/wc/store/v1/cart/remove-item",
      { key: line.key },
      nonce,
    );
    nonce = nAfterRm;
    if (!rm.ok) {
      const errText = await rm.text();
      throw new Error(errText || `remove-item failed (${rm.status})`);
    }
  }

  for (const line of items) {
    const productOrVariationId =
      line.variationId && line.variationId > 0 ? line.variationId : line.productId;
    const { res: add, nonce: nAfterAdd } = await storePost(
      req,
      "/wp-json/wc/store/v1/cart/add-item",
      {
        id: productOrVariationId,
        quantity: line.qty,
      },
      nonce,
    );
    nonce = nAfterAdd;
    if (!add.ok) {
      const errText = await add.text();
      throw new Error(errText || `add-item failed (${add.status})`);
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

  const { cart: finalCart, nonce: nonceAfterFinalRead } = await readStoreCart(req, nonce);
  const effectiveNonce = nonceAfterFinalRead ?? nonce;
  if (!effectiveNonce) {
    throw new Error(
      "WooCommerce Store API did not return a Nonce after syncing the cart. Check Nonce headers on your proxy.",
    );
  }

  const lineCount = Array.isArray(finalCart.items) ? finalCart.items.length : 0;
  if (lineCount === 0) {
    throw new Error(
      "WooCommerce cart has no line items after sync. Verify product/variation IDs and Store API permissions.",
    );
  }

  return {
    cartData: mapStoreCartToClientShape(finalCart, items),
    nonce: effectiveNonce,
    rawCart: finalCart,
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
