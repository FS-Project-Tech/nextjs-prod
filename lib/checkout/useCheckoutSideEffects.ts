import { useEffect } from "react";
import type { UseFormSetValue } from "react-hook-form";
import type { CheckoutFormData } from "./schema";
import { CHECKOUT_INSURANCE_STORAGE_KEY, type InsuranceOption } from "@/lib/checkout-parcel-protection";
import type { CartItem } from "@/lib/types/cart";
import { parseCartTotal } from "@/lib/cart/parseCartTotal";

type CouponCalc = (lines: CartItem[], subtotal: number) => void;

export function useMountFlag(setMounted: (v: boolean) => void): void {
  useEffect(() => {
    setMounted(true);
  }, [setMounted]);
}

export function useInsuranceHydration(
  isMounted: boolean,
  setValue: UseFormSetValue<CheckoutFormData>
): void {
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(CHECKOUT_INSURANCE_STORAGE_KEY);
      if (stored === "yes" || stored === "no") {
        setValue("insurance_option", stored, { shouldDirty: false });
      }
    } catch {
      /* ignore */
    }
  }, [isMounted, setValue]);
}

export function useInsurancePersistence(
  isMounted: boolean,
  insuranceResolved: InsuranceOption
): void {
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    try {
      localStorage.setItem(CHECKOUT_INSURANCE_STORAGE_KEY, insuranceResolved);
    } catch {
      /* ignore */
    }
  }, [isMounted, insuranceResolved]);
}

function stripCheckoutErrorQueryParamsFromAddressBar(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("cancelled") && !u.searchParams.has("error")) return;
    u.searchParams.delete("cancelled");
    u.searchParams.delete("error");
    const q = u.searchParams.toString();
    const next = u.pathname + (q ? `?${q}` : "");
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}

export function useCheckoutQueryToasts(
  isMounted: boolean,
  searchParams: URLSearchParams,
  showError: (m: string) => void
): void {
  useEffect(() => {
    if (!isMounted) return;
    const cancelled = searchParams.get("cancelled");
    const errCode = searchParams.get("error");
    if (cancelled === "true") {
      showError("Payment was cancelled.");
      stripCheckoutErrorQueryParamsFromAddressBar();
      return;
    }
    if (errCode) {
      const messages: Record<string, string> = {
        payment_failed: "Payment was declined or failed. Please try again.",
        session_expired: "Checkout session expired. Please start again.",
        order_creation_failed:
          "Payment may have succeeded but we could not create your order. Please contact support with your receipt.",
        payment_pending: "Payment is still processing. Check your email or try again shortly.",
      };
      showError(messages[errCode] || "Something went wrong. Please try again.");
      stripCheckoutErrorQueryParamsFromAddressBar();
    }
  }, [isMounted, searchParams, showError]);
}

export function useMirrorBillingToShipping(
  shipToDifferent: boolean,
  billingFirst: string,
  billingLast: string,
  billingCompany: string,
  billingAddr1: string,
  billingAddr2: string,
  billingCity: string,
  billingPostcode: string,
  billingCountry: string,
  billingState: string,
  setValue: UseFormSetValue<CheckoutFormData>
): void {
  useEffect(() => {
    if (shipToDifferent || !billingFirst) return;
    setValue("shipping_first_name", billingFirst);
    setValue("shipping_last_name", billingLast);
    setValue("shipping_company", billingCompany);
    setValue("shipping_address_1", billingAddr1);
    setValue("shipping_address_2", billingAddr2);
    setValue("shipping_city", billingCity);
    setValue("shipping_postcode", billingPostcode);
    setValue("shipping_country", billingCountry);
    setValue("shipping_state", billingState);
  }, [
    shipToDifferent,
    billingFirst,
    billingLast,
    billingCompany,
    billingAddr1,
    billingAddr2,
    billingCity,
    billingPostcode,
    billingCountry,
    billingState,
    setValue,
  ]);
}

export function useRecalculateCouponWhenCartChanges(
  appliedCoupon: unknown,
  cartLines: CartItem[],
  cartTotal: string | null | undefined,
  calculateDiscount: CouponCalc
): void {
  useEffect(() => {
    if (!appliedCoupon || cartLines.length === 0) return;
    const subtotal = parseCartTotal(cartTotal);
    calculateDiscount(cartLines, subtotal);
  }, [cartLines, cartTotal, appliedCoupon, calculateDiscount]);
}
