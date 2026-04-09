"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { calculateTaxableSubtotal } from "@/lib/cart/pricing";
import { submitCheckoutOrder } from "@/lib/payment/submitCheckoutOrder";
import { checkoutSchema, type CheckoutFormData, type ShippingMethodType } from "./schema";
import { CHECKOUT_FORM_DEFAULTS } from "./formDefaults";
import {
  useInsuranceHydration,
  useInsurancePersistence,
  useMountFlag,
  useCheckoutQueryToasts,
  useRecalculateCouponWhenCartChanges,
} from "./useCheckoutSideEffects";
import { applySavedBillingAddress, applySavedShippingAddress } from "./savedAddressPatch";

export function useCheckoutPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: cartLines, clear: clearLocalCart, total: cartTotalString } = useCart();
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount: couponDiscountAmount, calculateDiscount } = useCoupon();
  const { user } = useUser();
  const { addresses } = useAddresses();

  const [isMounted, setIsMounted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const submitGuardRef = useRef(false);
  const redirectPendingRef = useRef(false);
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

  const canUseOnAccount = useMemo(() => {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((r: unknown) => String(r || "").trim().toLowerCase())
      : [];
    const isAdmin = roles.includes("administrator");
    const isNdisApprovedRole = roles.includes("ndis-approved");
    return isAdmin || isNdisApprovedRole;
  }, [user?.roles]);

  useEffect(() => {
    if (!canUseOnAccount && selectedPaymentMethod === "cod") {
      setSelectedPaymentMethod("eway");
    }
  }, [canUseOnAccount, selectedPaymentMethod]);

  const form = useForm<CheckoutFormData>({
    resolver: yupResolver(checkoutSchema) as never,
    defaultValues: CHECKOUT_FORM_DEFAULTS,
  });

  const { control, register, handleSubmit, setValue, formState: { errors } } = form;
  // Scoped useWatch fields only — avoids subscribing to the entire form (no watch() snapshot).
  const watchedShippingMethod = useWatch({ control, name: "shippingMethod" });
  const watchedInsurance = useWatch({ control, name: "insurance_option", defaultValue: "no" });
  const shipToDifferentAddress = useWatch({
    control,
    name: "shipToDifferentAddress",
    defaultValue: false,
  });
  const insuranceResolved: InsuranceOption = watchedInsurance === "yes" ? "yes" : "no";

  /** One-shot apply of first saved address per section (returning customers). */
  const savedAddressHydrationRef = useRef({ billing: false, shipping: false });

  useEffect(() => {
    if (!shipToDifferentAddress) {
      savedAddressHydrationRef.current.shipping = false;
    }
  }, [shipToDifferentAddress]);

  const firstBillingId = billingAddresses[0]?.id;
  useEffect(() => {
    if (!isMounted || !user?.id) return;
    if (savedAddressHydrationRef.current.billing) return;
    if (selectedBillingAddressId) return;
    if (!firstBillingId) return;
    const addr = billingAddresses.find((a) => String(a.id) === String(firstBillingId));
    if (!addr) return;
    applySavedBillingAddress(setValue, addr);
    setSelectedBillingAddressId(String(addr.id));
    savedAddressHydrationRef.current.billing = true;
  }, [
    isMounted,
    user?.id,
    firstBillingId,
    billingAddresses,
    selectedBillingAddressId,
    setValue,
    setSelectedBillingAddressId,
  ]);

  const firstShippingId = shippingAddresses[0]?.id;
  useEffect(() => {
    if (!isMounted || !user?.id || !shipToDifferentAddress) return;
    if (savedAddressHydrationRef.current.shipping) return;
    if (selectedShippingAddressId) return;
    if (!firstShippingId) return;
    const addr = shippingAddresses.find((a) => String(a.id) === String(firstShippingId));
    if (!addr) return;
    applySavedShippingAddress(setValue, addr);
    setSelectedShippingAddressId(String(addr.id));
    savedAddressHydrationRef.current.shipping = true;
  }, [
    isMounted,
    user?.id,
    shipToDifferentAddress,
    firstShippingId,
    shippingAddresses,
    selectedShippingAddressId,
    setValue,
    setSelectedShippingAddressId,
  ]);

  const cartSubtotal = useMemo(() => parseCartTotal(cartTotalString), [cartTotalString]);
  const subtotal = parseCartTotal(cartTotalString);
  const taxableSubtotal = useMemo(() => calculateTaxableSubtotal(cartLines), [cartLines]);
  const shippingCost = watchedShippingMethod
    ? Number((watchedShippingMethod as ShippingMethodType)?.cost || 0)
    : 0;
  const couponDiscount = couponDiscountAmount || 0;
  const { parcelProtectionFee, gst, orderTotal } = useCheckoutTotals(
    subtotal,
    taxableSubtotal,
    shippingCost,
    couponDiscount,
    insuranceResolved
  );

  useMountFlag(setIsMounted);
  useInsuranceHydration(isMounted, setValue);
  useInsurancePersistence(isMounted, insuranceResolved);
  useCheckoutQueryToasts(isMounted, searchParams, showError);

  /** Warm checkout API + prefetch order review so post-submit navigation is instant. */
  useEffect(() => {
    if (!isMounted || cartLines.length === 0) return;
    router.prefetch("/checkout/order-review");
    const ac = new AbortController();
    void fetch("/api/checkout/payment-options", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: ac.signal,
    }).catch(() => {});
    return () => ac.abort();
  }, [isMounted, cartLines.length, router]);
  useRecalculateCouponWhenCartChanges(
    appliedCoupon,
    cartLines,
    cartTotalString,
    calculateDiscount
  );

  const replaceInternalCheckoutPath = useCallback(
    (path: string) => {
      router.replace(path, { scroll: false });
    },
    [router]
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
        redirectPendingRef,
        replaceInternalPath: replaceInternalCheckoutPath,
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
      replaceInternalCheckoutPath,
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
    canUseOnAccount,
    onFormSubmit,
  };
}
