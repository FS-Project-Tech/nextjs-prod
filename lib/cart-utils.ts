/**
 * Cart Calculation Utilities
 * Centralized functions for cart calculations (subtotal, GST, total)
 */
 
import type { CartItem } from "@/lib/types/cart";
 
// Export all utilities for stable HMR
 
/**
 * Calculate cart subtotal from items
 */
export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const price = Number(item.price || 0);
    return sum + price * item.qty;
  }, 0);
}
 
/**
 * Calculate GST (10% tax) on cart
 * GST is calculated on: (subtotal - discount) + shipping
 */
export function calculateGST(
  subtotal: number,
  shipping: number,
  discount: number = 0,
  /** Optional fees included in GST base (e.g. parcel protection) */
  additionalTaxable: number = 0
): number {
  const base = Math.max(0, subtotal - discount) + shipping + additionalTaxable;
  return Number((base * 0.1).toFixed(2));
}
 
/**
 * Calculate total cart amount
 * Total = (subtotal - discount) + shipping + GST
 */
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
  return Number(
    (subtotalAfterDiscount + shipping + additionalFees + calculatedGST).toFixed(2)
  );
}
 
/**
 * Parse cart total string to number
 * Handles the case where total comes from CartProvider as a string
 */
export function parseCartTotal(total: string | null | undefined): number {
  return parseFloat(total || "0");
}