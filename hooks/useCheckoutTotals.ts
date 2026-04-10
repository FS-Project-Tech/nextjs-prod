import { useMemo } from "react";
import { calculateGST, calculateTotal } from "@/lib/cart/pricing";

/** Checkout order summary totals (parcel protection removed from UI — no extra fee in headless totals). */
export function useCheckoutTotals(
  subtotal: number,
  taxableSubtotal: number,
  shippingCost: number,
  couponDiscount: number,
) {
  return useMemo(() => {
    const gst = calculateGST(subtotal, shippingCost, couponDiscount, 0, taxableSubtotal);
    const orderTotal = calculateTotal(subtotal, shippingCost, couponDiscount, gst, 0);
    return { gst, orderTotal };
  }, [subtotal, taxableSubtotal, shippingCost, couponDiscount]);
}
