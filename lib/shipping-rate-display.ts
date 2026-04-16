import { formatPrice } from "@/lib/format-utils";

/**
 * Price column for shipping options — mirrors WooCommerce-style labels for base methods.
 * Other methods (e.g. `flat_rate`, `table_rate`) always use {@link formatPrice}.
 */
export function formatShippingMethodCostDisplay(
  methodId: string | undefined,
  cost: number
): string {
  const base = String(methodId || "").toLowerCase().trim();
  const n = typeof cost === "number" && Number.isFinite(cost) ? cost : 0;

  if (base === "free_shipping" && n <= 0) return "Free";
  if (base === "local_pickup" && n <= 0) return "Free";

  return formatPrice(n);
}
