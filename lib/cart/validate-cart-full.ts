import "server-only";

import type { CartItem } from "@/lib/types/cart";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import { wcGet } from "@/lib/woocommerce/wc-fetch";

/**
 * Stock check + tax metadata from Woo REST.
 * Preserves each line's cart `price` when present (PDP may apply quantity-unit / packaging multipliers);
 * falls back to Woo catalog/sale price when the client price is missing or zero.
 */
export async function runFullCartValidation(items: CartItem[]): Promise<{
  valid: boolean;
  errors: Array<{ itemId: string; message: string }>;
  items: CartItem[];
}> {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: true, errors: [], items: [] };
  }

  const stock = await validateCartLineStock(items);
  if (!stock.valid) {
    return { valid: false, errors: stock.errors, items };
  }

  const out: CartItem[] = [];
  const errors: Array<{ itemId: string; message: string }> = [];

  for (const item of items) {
    try {
      const endpoint =
        item.variationId != null && item.variationId > 0
          ? `/products/${item.productId}/variations/${item.variationId}`
          : `/products/${item.productId}`;

      const { data } = await wcGet<{
        price?: string;
        regular_price?: string;
        sale_price?: string;
        on_sale?: boolean;
        tax_class?: string;
        tax_status?: string;
      }>(endpoint, { _fields: "id,price,regular_price,sale_price,on_sale,tax_class,tax_status" }, "noStore");

      const wooUnitRaw =
        data?.on_sale && data?.sale_price
          ? data.sale_price
          : data?.price || data?.regular_price || "0";
      const wooUnit = Number.parseFloat(String(wooUnitRaw ?? "0")) || 0;
      const clientUnit = Number.parseFloat(String(item.price ?? "0")) || 0;
      const unit = clientUnit > 0 ? clientUnit : wooUnit;

      out.push({
        ...item,
        price: unit.toFixed(2),
        tax_class: String(data?.tax_class ?? item.tax_class ?? ""),
        tax_status: String(data?.tax_status ?? item.tax_status ?? ""),
      });
    } catch {
      errors.push({
        itemId: item.id,
        message: `Unable to load price for ${item.name || item.id}`,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, items };
  }

  return { valid: true, errors: [], items: out };
}
