import { useMemo } from "react";
import { calculateGST, calculateTotal } from "@/lib/cart/pricing";
import type { InsuranceOption } from "@/lib/checkout-parcel-protection";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";

/**
 * Checkout totals including optional parcel protection fee (no GST on parcel protection).
 */
export function useCheckoutTotals(
  subtotal: number,
  taxableSubtotal: number,
  shippingCost: number,
  couponDiscount: number,
  insurance_option: InsuranceOption
) {
  return useMemo(() => {
    const parcelProtectionFee = insurance_option === "yes" ? PARCEL_PROTECTION_FEE_AUD : 0;
    const gst = calculateGST(subtotal, shippingCost, couponDiscount, 0, taxableSubtotal);
    const orderTotal = calculateTotal(
      subtotal,
      shippingCost,
      couponDiscount,
      gst,
      parcelProtectionFee
    );
    return { parcelProtectionFee, gst, orderTotal };
  }, [subtotal, taxableSubtotal, shippingCost, couponDiscount, insurance_option]);
}
