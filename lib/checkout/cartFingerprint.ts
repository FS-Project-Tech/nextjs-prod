import type { CartItem } from "@/lib/types/cart";

/**
 * Stable signature of the cart lines sent to quote-totals / checkout.
 * Used to drop stale HTTP responses so summary totals never reflect an older cart.
 */
export function cartLinesFingerprint(lines: CartItem[]): string {
  return [...lines]
    .map((l) => {
      const vid = l.variationId != null && l.variationId > 0 ? l.variationId : 0;
      const sku = l.sku != null ? String(l.sku).trim() : "";
      return `${l.id}|${l.productId}|${vid}|${l.qty}|${sku}`;
    })
    .sort()
    .join(";");
}
