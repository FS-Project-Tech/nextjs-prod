"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useCart } from "@/components/CartProvider";
import { getActiveCartSnapshot } from "@/store/cartStore";
import { useToast } from "@/components/ToastProvider";
import { useAddresses } from "@/hooks/useAddresses";
import { useUser } from "@/hooks/useUser";
import { useCoupon } from "@/components/CouponProvider";
import { useCheckoutTotals } from "@/hooks/useCheckoutTotals";
import { parseCartTotal } from "@/lib/cart/parseCartTotal";
import { calculateTaxableSubtotal } from "@/lib/cart/pricing";
import { submitCheckoutOrder } from "@/lib/payment/submitCheckoutOrder";
import { HEADLESS_CHECKOUT_SESSION_STORAGE_KEY } from "@/lib/checkout/checkoutSessionConstants";
import { buildCheckoutQuoteTotalsBody } from "@/lib/checkout/buildCreateOrderPayload";
import type { CheckoutTotals } from "@/types/checkout";
import { checkoutSchema, type CheckoutFormData, type ShippingMethodType } from "./schema";
import { CHECKOUT_FORM_DEFAULTS } from "./formDefaults";
import {
  useMountFlag,
  useCheckoutQueryToasts,
  useRecalculateCouponWhenCartChanges,
} from "./useCheckoutSideEffects";
import { applySavedBillingAddress, applySavedShippingAddress } from "./savedAddressPatch";
import { cartLinesFingerprint } from "./cartFingerprint";

/** Debounce before POST /api/checkout/quote-totals (ms). Lower = snappier; too low = excess API calls on address typing. */
const QUOTE_TOTALS_DEBOUNCE_MS = 120;

export function useCheckoutPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: cartLines, clear: clearLocalCart, total: cartTotalString, validateCart } = useCart();
  const cartLinesRef = useRef(cartLines);
  cartLinesRef.current = cartLines;
  const quoteEpochRef = useRef(0);
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount: couponDiscountAmount, calculateDiscount } = useCoupon();
  const { user, sessionStatus } = useUser();
  const { addresses } = useAddresses();

  const [isMounted, setIsMounted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const submitGuardRef = useRef(false);
  const redirectPendingRef = useRef(false);
  const checkoutSessionIdRef = useRef("");

  const ensureCheckoutSessionId = useCallback((): string => {
    if (checkoutSessionIdRef.current.trim()) return checkoutSessionIdRef.current.trim();
    try {
      let v = sessionStorage.getItem(HEADLESS_CHECKOUT_SESSION_STORAGE_KEY);
      if (!v && typeof crypto !== "undefined" && "randomUUID" in crypto) {
        v = crypto.randomUUID();
        sessionStorage.setItem(HEADLESS_CHECKOUT_SESSION_STORAGE_KEY, v);
      }
      checkoutSessionIdRef.current = v?.trim() || "";
    } catch {
      checkoutSessionIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
    }
    return checkoutSessionIdRef.current;
  }, []);
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

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  // Scoped useWatch fields only — avoids subscribing to the entire form (no watch() snapshot).
  const watchedShippingMethod = useWatch({ control, name: "shippingMethod" });
  const shipToDifferentAddress = useWatch({
    control,
    name: "shipToDifferentAddress",
    defaultValue: false,
  });
  const watchedInsurance = useWatch({ control, name: "insurance_option", defaultValue: "no" });
  const watchedBillingCountry = useWatch({ control, name: "billing_country", defaultValue: "AU" });
  const watchedBillingState = useWatch({ control, name: "billing_state", defaultValue: "" });
  const watchedBillingPostcode = useWatch({ control, name: "billing_postcode", defaultValue: "" });
  const watchedBillingCity = useWatch({ control, name: "billing_city", defaultValue: "" });
  const watchedShippingCountry = useWatch({ control, name: "shipping_country", defaultValue: "AU" });
  const watchedShippingState = useWatch({ control, name: "shipping_state", defaultValue: "" });
  const watchedShippingPostcode = useWatch({ control, name: "shipping_postcode", defaultValue: "" });
  const watchedShippingCity = useWatch({ control, name: "shipping_city", defaultValue: "" });
  const watchedCustNdis = useWatch({ control, name: "cust_woo_ndis_number", defaultValue: "" }) ?? "";
  const watchedLegacyNdis = useWatch({ control, name: "ndis_number", defaultValue: "" }) ?? "";

  const canUseOnAccount = useMemo(() => {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((r: unknown) => String(r || "").trim().toLowerCase())
      : [];
    const isAdmin = roles.includes("administrator");
    const isNdisApprovedRole = roles.includes("ndis-approved");
    const isB2bUser = roles.includes("b2b_user");
    const isB2b30Days = roles.includes("b2b30days");
    if (isAdmin || isNdisApprovedRole || isB2bUser || isB2b30Days) return true;
    if (user) return false;
    if (sessionStatus !== "unauthenticated") return false;
    const digits = `${watchedCustNdis}${watchedLegacyNdis}`.replace(/\D/g, "");
    return digits.length >= 9;
  }, [
    user,
    user?.roles,
    sessionStatus,
    watchedCustNdis,
    watchedLegacyNdis,
  ]);

  useEffect(() => {
    if (!canUseOnAccount && selectedPaymentMethod === "cod") {
      setSelectedPaymentMethod("eway");
    }
  }, [canUseOnAccount, selectedPaymentMethod]);

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
  const { gst, orderTotal } = useCheckoutTotals(
    subtotal,
    taxableSubtotal,
    shippingCost,
    couponDiscount
  );

  useMountFlag(setIsMounted);

  /** One Woo price refresh on checkout so line row prices match quote-totals / order creation. */
  const checkoutPriceSyncRef = useRef(false);
  useEffect(() => {
    if (!isMounted || cartLines.length === 0) {
      checkoutPriceSyncRef.current = false;
      return;
    }
    if (checkoutPriceSyncRef.current) return;
    checkoutPriceSyncRef.current = true;
    void validateCart();
  }, [isMounted, cartLines.length, validateCart]);

  const [serverTotals, setServerTotals] = useState<CheckoutTotals | null>(null);
  const [totalsQuoteLoading, setTotalsQuoteLoading] = useState(false);

  useEffect(() => {
    if (!isMounted || cartLines.length === 0) {
      setServerTotals(null);
      setTotalsQuoteLoading(false);
      return;
    }
    const sm = watchedShippingMethod as ShippingMethodType | undefined;
    if (!sm?.id) {
      setServerTotals(null);
      return;
    }
    // Drop previous quote immediately so Order summary uses client totals (selected rate, coupon, GST)
    // instead of stale server shipping/total until the new quote returns.
    setServerTotals(null);
    quoteEpochRef.current += 1;
    const epoch = quoteEpochRef.current;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      if (quoteEpochRef.current !== epoch) return;

      const linesSnapshot = cartLinesRef.current;
      const data = getValues() as CheckoutFormData;
      const body = buildCheckoutQuoteTotalsBody({
        data,
        cartLines: linesSnapshot,
        appliedCoupon,
      });
      if (!body) {
        setServerTotals(null);
        return;
      }
      const fingerprintAtSend = cartLinesFingerprint(linesSnapshot);
      setTotalsQuoteLoading(true);
      void fetch("/api/checkout/quote-totals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
        credentials: "include",
        cache: "no-store",
      })
      .then(async (res) => {
        if (ac.signal.aborted) return;
        if (quoteEpochRef.current !== epoch) return;
        if (cartLinesFingerprint(cartLinesRef.current) !== fingerprintAtSend) return;
      
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          totals?: CheckoutTotals;
          error?: string;
          shippingAdjusted?: boolean; // 👈 ADD
          shippingLine?: {
            method_id: string;
            method_title: string;
          };
        };
      
        if (!res.ok || !json.success || !json.totals) {
          if (quoteEpochRef.current === epoch) setServerTotals(null);
          return;
        }
      
        // ✅ ADD HERE
        if (json.shippingAdjusted && json.shippingLine?.method_id) {
          success("Shipping method updated automatically"); // your toast
      
          setValue("shippingMethod", {
            id: json.shippingLine.method_id,
            label: json.shippingLine.method_title,
          });
        }
      
        setServerTotals(json.totals);
      })
        .catch(() => {
          if (!ac.signal.aborted && quoteEpochRef.current === epoch) setServerTotals(null);
        })
        .finally(() => {
          if (!ac.signal.aborted && quoteEpochRef.current === epoch) setTotalsQuoteLoading(false);
        });
    }, QUOTE_TOTALS_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [
    isMounted,
    cartLines,
    appliedCoupon,
    watchedShippingMethod,
    shipToDifferentAddress,
    watchedInsurance,
    watchedBillingCountry,
    watchedBillingState,
    watchedBillingPostcode,
    watchedBillingCity,
    watchedShippingCountry,
    watchedShippingState,
    watchedShippingPostcode,
    watchedShippingCity,
    getValues,
  ]);

  const summarySubtotal = serverTotals?.subtotal ?? subtotal;
  const summaryShipping = serverTotals?.shipping ?? shippingCost;
  const summaryDiscount = serverTotals?.discount ?? couponDiscount;
  const summaryGst = serverTotals?.gst ?? gst;
  const summaryOrderTotal = serverTotals?.total ?? orderTotal;
  const summaryCartSubtotal = serverTotals?.subtotal ?? cartSubtotal;

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
      if (placing) return;
      const validated = await validateCart();
      if (!validated.valid) {
        const first = validated.errors[0]?.message?.trim();
        showError(first || "Your cart could not be validated. Please review your items.");
        return;
      }
      const linesForOrder = getActiveCartSnapshot();
      if (process.env.NODE_ENV === "development") {
        console.log("[checkout] placing order with Zustand lines (post-validation):", linesForOrder);
      }
      await submitCheckoutOrder({
        data,
        cartLines: linesForOrder,
        checkoutSessionId: ensureCheckoutSessionId(),
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
      placing,
      validateCart,
      selectedPaymentMethod,
      ewayTokenFlowEnabled,
      appliedCoupon,
      searchParams,
      showError,
      success,
      clearLocalCart,
      user?.id,
      replaceInternalCheckoutPath,
      ensureCheckoutSessionId,
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
    subtotal: summarySubtotal,
    cartSubtotal: summaryCartSubtotal,
    couponDiscount: summaryDiscount,
    appliedCoupon,
    shippingCost: summaryShipping,
    gst: summaryGst,
    orderTotal: summaryOrderTotal,
    totalsQuoteLoading,
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
