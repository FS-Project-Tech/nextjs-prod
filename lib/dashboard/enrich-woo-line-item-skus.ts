import "server-only";

import wcAPI from "@/lib/woocommerce";

/**
 * WooCommerce often persists line items without `sku` even when the product/variation has one.
 * Resolve SKU from the catalog for dashboard display (batched by product/variation id).
 */
async function fetchSkuFromCatalog(productId: number, variationId: number): Promise<string | undefined> {
  try {
    if (variationId > 0) {
      const { data } = await wcAPI.get(`/products/${productId}/variations/${variationId}`, {
        params: { _fields: "sku" },
      });
      const s = (data as { sku?: string } | undefined)?.sku;
      if (s != null && String(s).trim()) return String(s).trim();
    } else {
      const { data } = await wcAPI.get(`/products/${productId}`, {
        params: { _fields: "sku" },
      });
      const s = (data as { sku?: string } | undefined)?.sku;
      if (s != null && String(s).trim()) return String(s).trim();
    }
  } catch {
    /* 404 / permission */
  }
  return undefined;
}

export async function enrichLineItemsWithWooSkus(
  lineItems: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const out = lineItems.map((li) => ({ ...li }));

  const unique = new Map<string, { productId: number; variationId: number }>();
  for (const li of out) {
    if (li.sku != null && String(li.sku).trim()) continue;
    const productId = Number(li.product_id ?? 0);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    const vidRaw = Number(li.variation_id ?? 0);
    const variationId = Number.isFinite(vidRaw) && vidRaw > 0 ? vidRaw : 0;
    const key = `${productId}:${variationId}`;
    unique.set(key, { productId, variationId });
  }

  const skuByKey = new Map<string, string>();
  await Promise.all(
    [...unique.entries()].map(async ([key, { productId, variationId }]) => {
      const sku = await fetchSkuFromCatalog(productId, variationId);
      if (sku) skuByKey.set(key, sku);
    }),
  );

  for (const li of out) {
    if (li.sku != null && String(li.sku).trim()) continue;
    const productId = Number(li.product_id ?? 0);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    const vidRaw = Number(li.variation_id ?? 0);
    const variationId = Number.isFinite(vidRaw) && vidRaw > 0 ? vidRaw : 0;
    const key = `${productId}:${variationId}`;
    const sku = skuByKey.get(key);
    if (sku) li.sku = sku;
  }

  return out;
}
