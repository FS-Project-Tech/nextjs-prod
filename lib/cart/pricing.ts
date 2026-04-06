import type { CartItem } from "@/lib/types/cart";

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, cartItem) => {
    const price = Number(cartItem.price || 0);
    return sum + price * cartItem.qty;
  }, 0);
}

export function calculateGST(
  subtotal: number,
  _shipping: number,
  discount: number = 0,
  additionalTaxable: number = 0
): number {
  // Shipping is non-taxable: GST is calculated on items (after discount) + explicitly taxable extras only.
  const base = Math.max(0, subtotal - discount) + additionalTaxable;
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
