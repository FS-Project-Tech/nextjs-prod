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

type StoreCartJson = {
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
};

async function storeHeaders(req: NextRequest): Promise<HeadersInit> {
  const session = await getWCSessionHeaders();
  const cookie = req.headers.get("cookie") || "";
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (cookie) h.Cookie = cookie;
  if (session["X-WC-Session"]) h["X-WC-Session"] = session["X-WC-Session"];
  return h;
}

async function readStoreCart(req: NextRequest): Promise<StoreCartJson> {
  const res = await fetch(`${storeApiOrigin()}/wp-json/wc/store/v1/cart`, {
    method: "GET",
    headers: await storeHeaders(req),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Store cart GET failed (${res.status})`);
  }
  return (await res.json()) as StoreCartJson;
}

async function storePost(req: NextRequest, path: string, body: unknown): Promise<Response> {
  return fetch(`${storeApiOrigin()}${path}`, {
    method: "POST",
    headers: await storeHeaders(req),
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function mapStoreCartToClientShape(
  cart: StoreCartJson,
  requestedLines: CartItem[]
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

export async function syncCartViaStoreApi(
  req: NextRequest,
  items: CartItem[],
  couponCode?: string
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

  let current = await readStoreCart(req);
  for (const line of current.items || []) {
    if (!line.key) continue;
    const rm = await storePost(req, "/wp-json/wc/store/v1/cart/remove-item", { key: line.key });
    if (!rm.ok) {
      const errText = await rm.text();
      throw new Error(errText || `remove-item failed (${rm.status})`);
    }
  }

  for (const line of items) {
    const productOrVariationId =
      line.variationId && line.variationId > 0 ? line.variationId : line.productId;
    const add = await storePost(req, "/wp-json/wc/store/v1/cart/add-item", {
      id: productOrVariationId,
      quantity: line.qty,
    });
    if (!add.ok) {
      const errText = await add.text();
      throw new Error(errText || `add-item failed (${add.status})`);
    }
  }

  if (couponCode?.trim()) {
    const applied = await storePost(req, "/wp-json/wc/store/v1/cart/apply-coupon", {
      code: couponCode.trim(),
    });
    if (!applied.ok) {
      const errText = await applied.text();
      throw new Error(errText || `apply-coupon failed (${applied.status})`);
    }
  }

  current = await readStoreCart(req);
  return mapStoreCartToClientShape(current, items);
}
