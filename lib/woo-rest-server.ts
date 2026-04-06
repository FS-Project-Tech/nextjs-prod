import "server-only";

import { wcGet } from "@/lib/woocommerce/wc-fetch";
import type { CartItem } from "@/lib/types/cart";
import { productsKey, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";
import { fetchJsonCached } from "@/services/api";

export type WooCommerceCartLineForSync = {
  id: string;
  product_id: number;
  variation_id?: number;
  quantity: number;
  name: string;
  price: string;
  sku?: string;
  image?: { src: string; alt: string };
  stock_status?: string;
  stock_quantity?: number | null;
};

export type WooCommerceCartData = {
  items: WooCommerceCartLineForSync[];
  subtotal: string;
  total: string;
  tax_total: string;
  shipping_total: string;
  discount_total: string;
  coupon_lines?: Array<{ code: string; discount: string }>;
};

export async function fetchProductsByIdsForServer(productIds: number[]): Promise<unknown[]> {
  const ids = [...new Set(productIds)].filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return [];

  const baseUrl = process.env.NEXT_PUBLIC_WP_URL?.replace(/\/+$/, "");
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!baseUrl || !key || !secret) {
    const products = await Promise.all(
      ids.map(async (id) => {
        const { data } = await wcGet<unknown>(`/products/${id}`, undefined, "product");
        return data;
      }),
    );
    return products;
  }

  const include = ids.join(",");
  const url = `${baseUrl}/wp-json/wc/v3/products?include=${encodeURIComponent(
    include
  )}&per_page=${Math.min(100, ids.length)}`;
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;

  const data = await fetchJsonCached<unknown[]>(url, {
    cacheKey: productsKey({ include, per_page: Math.min(100, ids.length) }),
    ttlSeconds: CACHE_TTL.PRODUCTS,
    tags: [CACHE_TAGS.PRODUCTS],
    timeoutMs: 10000,
    retries: 1,
    init: { headers: { Authorization: auth } },
  });

  return Array.isArray(data) ? data : [];
}

export async function getProductsByBrandForServer(brandId: number): Promise<unknown> {
  const { data } = await wcGet<unknown[]>(
    "/products",
    { product_brand: brandId, per_page: 20 },
    "products",
  );
  return data;
}

export async function getFeaturedProductsSampleForServer(): Promise<unknown> {
  const { data } = await wcGet<unknown[]>(
    "/products",
    { per_page: 5, _fields: "id,name,slug,price,images" },
    "products",
  );
  return data;
}

export async function validateCartLineStock(
  items: CartItem[]
): Promise<{ valid: boolean; errors: Array<{ itemId: string; message: string }> }> {
  const errors: Array<{ itemId: string; message: string }> = [];

  for (const line of items) {
    try {
      const endpoint = line.variationId
        ? `/products/${line.productId}/variations/${line.variationId}`
        : `/products/${line.productId}`;

      const { data: product } = await wcGet<{
        stock_status?: string;
        manage_stock?: boolean;
        stock_quantity?: number | null;
        backorders_allowed?: boolean;
      }>(endpoint, undefined, "noStore");

      if (product.stock_status === "outofstock") {
        errors.push({ itemId: line.id, message: `${line.name} is out of stock` });
      } else if (product.manage_stock && product.stock_quantity != null) {
        if (product.stock_quantity < line.qty) {
          const msg = product.backorders_allowed
            ? `${line.name} (only ${product.stock_quantity} available, backorders allowed)`
            : `${line.name} (only ${product.stock_quantity} available)`;
          errors.push({ itemId: line.id, message: msg });
        }
      }
    } catch {
      errors.push({ itemId: line.id, message: `Unable to validate ${line.name}` });
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function resolveUnitPricesForCartLines(
  items: CartItem[]
): Promise<Map<string, string>> {
  const priceByLineId = new Map<string, string>();

  await Promise.all(
    items.map(async (line) => {
      try {
        const endpoint = line.variationId
          ? `/products/${line.productId}/variations/${line.variationId}`
          : `/products/${line.productId}`;

        const { data: product } = await wcGet<{
          price?: string;
          regular_price?: string;
          sale_price?: string;
          on_sale?: boolean;
        }>(endpoint, { _fields: "id,price,regular_price,sale_price,on_sale" }, "noStore");

        const unit =
          product.on_sale && product.sale_price
            ? product.sale_price
            : product.price || product.regular_price || line.price;

        priceByLineId.set(line.id, unit ?? line.price);
      } catch {
        priceByLineId.set(line.id, line.price);
      }
    })
  );

  return priceByLineId;
}
