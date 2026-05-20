import "server-only";

import type { CartItem } from "@/lib/types/cart";
import { wcGet } from "@/lib/woocommerce/wc-fetch";

type WooProduct = {
  stock_status?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
  backorders_allowed?: boolean;

  price?: string;
  regular_price?: string;
  sale_price?: string;
  on_sale?: boolean;

  tax_class?: string;
  tax_status?: string;
};

export async function runFullCartValidation(
  items: CartItem[]
): Promise<{
  valid: boolean;
  errors: Array<{ itemId: string; message: string }>;
  items: CartItem[];
}> {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      valid: true,
      errors: [],
      items: [],
    };
  }

  const requests = items.map(async (item) => {
    try {
      const endpoint =
        item.variationId != null && item.variationId > 0
          ? `/products/${item.productId}/variations/${item.variationId}`
          : `/products/${item.productId}`;

      const { data } = await wcGet<WooProduct>(
        endpoint,
        {
          _fields:
            "id,stock_status,manage_stock,stock_quantity,backorders_allowed,price,regular_price,sale_price,on_sale,tax_class,tax_status",
        },
        "noStore"
      );

      return {
        item,
        data,
        error: null,
      };
    } catch {
      return {
        item,
        data: null,
        error: `Unable to validate ${item.name || item.id}`,
      };
    }
  });

  const results = await Promise.all(requests);

  const errors: Array<{ itemId: string; message: string }> = [];
  const out: CartItem[] = [];

  for (const result of results) {
    const { item, data, error } = result;

    if (error || !data) {
      errors.push({
        itemId: item.id,
        message: error || "Unknown error",
      });
      continue;
    }

    // STOCK VALIDATION
    if (data.stock_status === "outofstock") {
      errors.push({
        itemId: item.id,
        message: `${item.name} is out of stock`,
      });
      continue;
    }

    if (
      data.manage_stock &&
      data.stock_quantity != null &&
      data.stock_quantity < item.qty
    ) {
      errors.push({
        itemId: item.id,
        message: data.backorders_allowed
          ? `${item.name} (only ${data.stock_quantity} available, backorders allowed)`
          : `${item.name} (only ${data.stock_quantity} available)`,
      });

      continue;
    }

    // PRICE VALIDATION
    const wooUnitRaw =
      data.on_sale && data.sale_price
        ? data.sale_price
        : data.price || data.regular_price || "0";

    const wooUnit =
      Number.parseFloat(String(wooUnitRaw ?? "0")) || 0;

    const clientUnit =
      Number.parseFloat(String(item.price ?? "0")) || 0;

    const unit = clientUnit > 0 ? clientUnit : wooUnit;

    out.push({
      ...item,
      price: unit.toFixed(2),
      tax_class: String(data.tax_class ?? item.tax_class ?? ""),
      tax_status: String(data.tax_status ?? item.tax_status ?? ""),
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    items: errors.length ? items : out,
  };
}