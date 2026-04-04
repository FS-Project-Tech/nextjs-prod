"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import { useAddresses } from "@/hooks/useAddresses";
import { useUser } from "@/hooks/useUser";
import { useCoupon } from "@/components/CouponProvider";
import { useCheckoutTotals } from "@/hooks/useCheckoutTotals";
import type { InsuranceOption } from "@/lib/checkout-parcel-protection";
import { parseCartTotal } from "@/lib/cart/parseCartTotal";
import { submitCheckoutOrder } from "@/lib/payment/submitCheckoutOrder";
import { checkoutSchema, type CheckoutFormData, type ShippingMethodType } from "./schema";
import { CHECKOUT_FORM_DEFAULTS } from "./formDefaults";
import { checkoutPaymentMethodOptions, canUseOnAccountPayment } from "./paymentMethodsFromSession";
import {
  useInsuranceHydration,
  useInsurancePersistence,
  useMountFlag,
  useCheckoutQueryToasts,
  useRecalculateCouponWhenCartChanges,
  useRestrictCodWhenUnauthorized,
} from "./useCheckoutSideEffects";

export function useCheckoutPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: cartLines, clear: clearLocalCart, total: cartTotalString } = useCart();
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount: couponDiscountAmount, calculateDiscount } = useCoupon();
  const { user } = useUser();
  const { data: session } = useSession();
  const { addresses } = useAddresses();

  const [isMounted, setIsMounted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const submitGuardRef = useRef(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState("");
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState("");
  const [openNdisSection, setOpenNdisSection] = useState(false);
  const [openHcpSection, setOpenHcpSection] = useState(false);
  const [postSubmitNavigation, setPostSubmitNavigation] = useState<
    null | "secure_payment" | "order_confirmation"
  >(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"eway" | "cod">("eway");

  const ewayTokenFlowEnabled =
    typeof process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW === "string" &&
    process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW === "true";

  const billingAddresses = useMemo(
    () => addresses.filter((row) => row.type === "billing"),
    [addresses]
  );
  const shippingAddresses = useMemo(
    () => addresses.filter((row) => row.type === "shipping"),
    [addresses]
  );

  const form = useForm<CheckoutFormData>({
    resolver: yupResolver(checkoutSchema) as never,
    defaultValues: CHECKOUT_FORM_DEFAULTS,
  });

  const { control, register, handleSubmit, setValue, formState: { errors } } = form;
  // Scoped useWatch fields only — avoids subscribing to the entire form (no watch() snapshot).
  const watchedShippingMethod = useWatch({ control, name: "shippingMethod" });
  const watchedInsurance = useWatch({ control, name: "insurance_option", defaultValue: "no" });
  const insuranceResolved: InsuranceOption = watchedInsurance === "yes" ? "yes" : "no";

  const canUseOnAccount = canUseOnAccountPayment(session);
  const paymentMethods = checkoutPaymentMethodOptions(session);

  const cartSubtotal = useMemo(() => parseCartTotal(cartTotalString), [cartTotalString]);
  const subtotal = parseCartTotal(cartTotalString);
  const shippingCost = watchedShippingMethod
    ? Number((watchedShippingMethod as ShippingMethodType)?.cost || 0)
    : 0;
  const couponDiscount = couponDiscountAmount || 0;
  const { parcelProtectionFee, gst, orderTotal } = useCheckoutTotals(
    subtotal,
    shippingCost,
    couponDiscount,
    insuranceResolved
  );

  useMountFlag(setIsMounted);
  useInsuranceHydration(isMounted, setValue);
  useInsurancePersistence(isMounted, insuranceResolved);
  useRestrictCodWhenUnauthorized(canUseOnAccount, selectedPaymentMethod, setSelectedPaymentMethod);
  useCheckoutQueryToasts(isMounted, searchParams, router, showError);
  useRecalculateCouponWhenCartChanges(
    appliedCoupon,
    cartLines,
    cartTotalString,
    calculateDiscount
  );

  const onSubmit = useCallback(
    async (data: CheckoutFormData) => {
      await submitCheckoutOrder({
        data,
        cartLines,
        selectedPaymentMethod,
        ewayTokenFlowEnabled,
        appliedCoupon,
        couponSearchParam: searchParams.get("coupon"),
        showError,
        success,
        clearLocalCart,
        userId: user?.id,
        setPostSubmitNavigation,
        submitGuardRef,
        setPlacing,
      });
    },
    [
      cartLines,
      selectedPaymentMethod,
      ewayTokenFlowEnabled,
      appliedCoupon,
      searchParams,
      showError,
      success,
      clearLocalCart,
      user?.id,
    ]
  );

  const onFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void handleSubmit(onSubmit)(event);
    },
    [handleSubmit, onSubmit]
  );

  return {
    isMounted,
    cartLines,
    subtotal,
    cartSubtotal,
    couponDiscount,
    appliedCoupon,
    shippingCost,
    parcelProtectionFee,
    gst,
    orderTotal,
    postSubmitNavigation,
    placing,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    paymentMethods,
    user,
    billingAddresses,
    shippingAddresses,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    selectedShippingAddressId,
    setSelectedShippingAddressId,
    openNdisSection,
    setOpenNdisSection,
    openHcpSection,
    setOpenHcpSection,
    control,
    register,
    errors,
    setValue,
    ewayTokenFlowEnabled,
    onFormSubmit,
  };
}
