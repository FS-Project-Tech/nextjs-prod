import { categoryIdsFromCatalogProduct } from "@/lib/coupon/wooCouponEligibility";
import { wcGet } from "@/lib/woocommerce/wc-fetch";

/**
 * Price, sale flag, and category IDs for coupon eligibility (WC REST product or variation).
 */
export async function fetchLineCouponMeta(
  productId: number,
  variationId: number,
): Promise<{ unit: number; on_sale: boolean; category_ids: number[] }> {
  if (variationId > 0) {
    const { data } = await wcGet<Record<string, unknown>>(
      `/products/${productId}/variations/${variationId}`,
      undefined,
      "noStore",
    );
    const sale = Number.parseFloat(String(data?.sale_price ?? "")) || 0;
    const reg = Number.parseFloat(String(data?.regular_price ?? "")) || 0;
    const price = Number.parseFloat(String(data?.price ?? "0")) || 0;
    const unit = price > 0 ? price : sale > 0 ? sale : reg;
    const onSale =
      Boolean(data?.on_sale) || (reg > 0 && sale > 0 && sale < reg) || (reg > 0 && unit > 0 && unit < reg);
    let category_ids = categoryIdsFromCatalogProduct(data);
    if (category_ids.length === 0) {
      const parent = await wcGet<Record<string, unknown>>(`/products/${productId}`, undefined, "noStore");
      category_ids = categoryIdsFromCatalogProduct(parent.data as Record<string, unknown>);
    }
    return { unit, on_sale: onSale, category_ids };
  }

  const { data } = await wcGet<Record<string, unknown>>(`/products/${productId}`, undefined, "noStore");
  const unit = Number.parseFloat(String(data?.price ?? "0")) || 0;
  const onSale = Boolean(data?.on_sale);
  const category_ids = categoryIdsFromCatalogProduct(data);
  return { unit, on_sale: onSale, category_ids };
}
