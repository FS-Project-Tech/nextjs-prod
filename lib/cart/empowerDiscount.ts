import type { CartItem } from "@/lib/types/cart";

export const EMPOWER_TAG_SLUG = "empower";
export const EMPOWER_DISCOUNT_RATE = 0.1;

export function hasEmpowerTag(
  tags?: Array<{ id?: number; name?: string; slug?: string }>
): boolean {
  const list = Array.isArray(tags) ? tags : [];
  return list.some((t) => {
    const name = String(t?.name || "").trim().toLowerCase();
    const slug = String(t?.slug || "").trim().toLowerCase();
    return name === EMPOWER_TAG_SLUG || slug === EMPOWER_TAG_SLUG;
  });
}

function toPrice(v: unknown): number {
  const n = Number.parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isEmpowerDiscountEligible(item: CartItem): boolean {
  return item.empowerEligible === true;
}

/** Display/checkout unit price after Empower line discount. */
export function getEmpowerDiscountedUnitPrice(item: CartItem): number {
  const base = toPrice(item.price);
  if (!isEmpowerDiscountEligible(item) || base <= 0) return base;
  return Number((base * (1 - EMPOWER_DISCOUNT_RATE)).toFixed(2));
}

export function getEmpowerLineDiscount(item: CartItem): number {
  if (!isEmpowerDiscountEligible(item)) return 0;
  const base = toPrice(item.price);
  const discounted = getEmpowerDiscountedUnitPrice(item);
  const qty = Math.max(0, Number(item.qty || 0));
  const delta = (base - discounted) * qty;
  return Number(delta.toFixed(2));
}

export function getEmpowerDiscountSummary(items: CartItem[]): {
  applied: boolean;
  itemsCount: number;
  discountTotal: number;
} {
  let itemsCount = 0;
  let discountTotal = 0;
  for (const row of items) {
    if (!isEmpowerDiscountEligible(row)) continue;
    itemsCount += Math.max(1, Number(row.qty || 1));
    discountTotal += getEmpowerLineDiscount(row);
  }
  const rounded = Number(discountTotal.toFixed(2));
  return { applied: rounded > 0, itemsCount, discountTotal: rounded };
}

