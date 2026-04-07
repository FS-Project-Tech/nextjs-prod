import type { CartItem } from "@/lib/types/cart";

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, cartItem) => {
    const price = Number(cartItem.price || 0);
    return sum + price * cartItem.qty;
  }, 0);
}

function norm(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export function isTaxableByClassStatus(taxClass?: string, taxStatus?: string): boolean {
  const cls = norm(taxClass);
  const status = norm(taxStatus);
  if (status === "none" || cls === "gst-free" || cls === "gstfree") {
    return false;
  }
  return true;
}

export function calculateTaxableSubtotal(items: CartItem[]): number {
  return items.reduce((sum, cartItem) => {
    const price = Number(cartItem.price || 0);
    if (!Number.isFinite(price) || price <= 0) return sum;
    const qty = Number(cartItem.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    if (!isTaxableByClassStatus(cartItem.tax_class, cartItem.tax_status)) return sum;
    return sum + price * qty;
  }, 0);
}

export function calculateGST(
  subtotal: number,
  _shipping: number,
  discount: number = 0,
  additionalTaxable: number = 0,
  taxableSubtotal?: number
): number {
  // Shipping is non-taxable.
  // GST is calculated from taxable item subtotal after proportional discount + explicitly taxable extras.
  const safeSubtotal = Math.max(0, subtotal);
  const safeTaxable = Math.max(0, taxableSubtotal ?? safeSubtotal);
  const safeDiscount = Math.max(0, discount);
  const discountRatio = safeSubtotal > 0 ? Math.min(1, safeDiscount / safeSubtotal) : 0;
  const discountedTaxable = safeTaxable * (1 - discountRatio);
  const base = Math.max(0, discountedTaxable) + additionalTaxable;
  return Number((base * 0.1).toFixed(2));
}

export function calculateTotal(
  subtotal: number,
  shipping: number,
  discount: number = 0,
  gst?: number,
  additionalFees: number = 0
): number {
  const subtotalAfterDiscount = Math.max(0, subtotal - discount);
  const calculatedGST =
    gst !== undefined ? gst : calculateGST(subtotal, shipping, discount, additionalFees);
  return Number((subtotalAfterDiscount + shipping + additionalFees + calculatedGST).toFixed(2));
}

export function parseCartTotal(total: string | null | undefined): number {
  return parseFloat(total || "0");
}
