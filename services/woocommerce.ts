import wcAPI from "@/lib/woocommerce";
import type { CheckoutAddress } from "@/types/checkout";
import { productsKey, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";
import { fetchJsonCached } from "@/services/api";

export type WooLineItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
};

export type WooCreateOrderInput = {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  status: string;
  customer_id?: number;
  line_items: WooLineItem[];
  billing: CheckoutAddress;
  shipping: CheckoutAddress;
  shipping_line?: { method_id: string; method_title: string; total: string };
  coupon_code?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
};

export async function getProducts(productIds: number[]): Promise<any[]> {
  const ids = [...new Set(productIds)].filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return [];

  const baseUrl = process.env.NEXT_PUBLIC_WP_URL?.replace(/\/+$/, "");
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!baseUrl || !key || !secret) {
    // Fallback to existing client when env isn't available.
    const products = await Promise.all(
      ids.map(async (id) => {
        const res = await wcAPI.get(`/products/${id}`);
        return res.data;
      })
    );
    return products;
  }

  const include = ids.join(",");
  const url = `${baseUrl}/wp-json/wc/v3/products?include=${encodeURIComponent(
    include
  )}&per_page=${Math.min(100, ids.length)}`;
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;

  const data = await fetchJsonCached<any[]>(url, {
    cacheKey: productsKey({ include, per_page: Math.min(100, ids.length) }),
    ttlSeconds: CACHE_TTL.PRODUCTS,
    tags: [CACHE_TAGS.PRODUCTS],
    timeoutMs: 10000,
    retries: 1,
    init: {
      headers: {
        Authorization: auth,
      },
    },
  });

  return Array.isArray(data) ? data : [];
}

export async function createWooOrder(input: WooCreateOrderInput): Promise<any> {
  const payload: Record<string, unknown> = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    ...(input.customer_id && input.customer_id > 0
      ? { customer_id: input.customer_id }
      : {}),
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
    meta_data: input.meta_data || [],
  };
  if (input.shipping_line) {
    payload.shipping_lines = [input.shipping_line];
  }
  if (input.coupon_code?.trim()) {
    payload.coupon_lines = [{ code: input.coupon_code.trim() }];
  }
  const res = await wcAPI.post("/orders", payload);
  return res.data;
}

export async function updateWooOrder(orderId: number, patch: Record<string, unknown>): Promise<any> {
  const res = await wcAPI.put(`/orders/${orderId}`, patch);
  return res.data;
}

