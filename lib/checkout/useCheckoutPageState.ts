"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useCart } from "@/components/CartProvider";
import {
  getActiveCartSnapshot,
  getCartPersistHydrated,
  subscribeCartPersistHydrated,
} from "@/store/cartStore";
import { useToast } from "@/components/ToastProvider";
import { useAddresses } from "@/hooks/useAddresses";
import { useUser } from "@/hooks/useUser";
import { useCoupon } from "@/components/CouponProvider";
import { useCheckoutTotals } from "@/hooks/useCheckoutTotals";
import { parseCartTotal } from "@/lib/cart/parseCartTotal";
import { calculateTaxableSubtotal } from "@/lib/cart/pricing";
import { getEmpowerDiscountSummary } from "@/lib/cart/empowerDiscount";
import { submitCheckoutOrder } from "@/lib/payment/submitCheckoutOrder";
import { HEADLESS_CHECKOUT_SESSION_STORAGE_KEY } from "@/lib/checkout/checkoutSessionConstants";
import {
  cleanupStaleCheckoutSubmitLock,
  clearCheckoutSubmitLock,
  hasRecentSubmitLockForRecovery,
  readActiveSubmitId,
  shouldBlockSubmitDueToRecentLock,
  writeCheckoutSubmitLock,
} from "@/lib/checkout/checkoutSubmitSession";
import { buildCheckoutQuoteTotalsBody } from "@/lib/checkout/buildCreateOrderPayload";
import type {
  CheckoutPlacingPhase,
  CheckoutQuoteSnapshotV1,
  CheckoutQuoteSigningPayload,
  CheckoutTotals,
} from "@/types/checkout";
import { checkoutSchema, type CheckoutFormData, type ShippingMethodType } from "./schema";
import { CHECKOUT_FORM_DEFAULTS } from "./formDefaults";
import { useMountFlag, useCheckoutQueryToasts } from "./useCheckoutSideEffects";
import { applySavedBillingAddress, applySavedShippingAddress } from "./savedAddressPatch";
import { cartLinesFingerprint } from "./cartFingerprint";
import {
  clearCheckoutFormDraft,
  mergeCheckoutFormDraft,
  readCheckoutFormDraft,
  writeCheckoutFormDraft,
} from "./checkoutFormPersistence";

/** Debounce before POST /api/checkout/quote-totals (ms). Lower = snappier; too low = excess API calls on address typing. */
const QUOTE_TOTALS_DEBOUNCE_MS = 300;

export function useCheckoutPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    items: cartLines,
    clear: clearLocalCart,
    total: cartTotalString,
    validateCart,
    isHydrated: cartIsHydrated,
    hasLoadedServerCart,
  } = useCart();
  const cartLinesRef = useRef(cartLines);
  cartLinesRef.current = cartLines;
  const quoteEpochRef = useRef(0);
  /** Latest quote-totals fetch; aborted on submit so submit traffic is not contending with quote. */
  const quoteFetchAbortRef = useRef<AbortController | null>(null);
  /** HMAC bundle from the last successful quote-totals (fast create-session). Cleared when quote is invalidated. */
  const lastSignedQuoteRef = useRef<CheckoutQuoteSigningPayload | null>(null);
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount: couponDiscountAmount } = useCoupon();
  const { user, sessionStatus, loading: authLoading } = useUser();
  const { addresses } = useAddresses();

  const [isMounted, setIsMounted] = useState(false);
  const [cartPersistReady, setCartPersistReady] = useState(getCartPersistHydrated);
  const [placing, setPlacing] = useState(false);
  const [placingSubmitPhase, setPlacingSubmitPhase] = useState<CheckoutPlacingPhase>("idle");
  const [empowerDiscountApplied, setEmpowerDiscountApplied] = useState(false);
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
  const [recoveryBannerVisible, setRecoveryBannerVisible] = useState(false);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"eway" | "cod" | "afterpay">(
    "eway"
  );
  const selectedPaymentMethodRef = useRef(selectedPaymentMethod);
  selectedPaymentMethodRef.current = selectedPaymentMethod;
  /** When user picks a payment option in the UI; used so draft re-hydration cannot overwrite with an older saved method after eWAY return. */
  const paymentMethodTouchedAtRef = useRef(0);

  const checkoutPersistRefs = useRef<{
    postSubmitNavigation: null | "secure_payment" | "order_confirmation";
    selectedPaymentMethod: "eway" | "cod" | "afterpay";
    empowerDiscountApplied: boolean;
    selectedBillingAddressId: string;
    selectedShippingAddressId: string;
  }>({
    postSubmitNavigation: null,
    selectedPaymentMethod: "eway",
    empowerDiscountApplied: false,
    selectedBillingAddressId: "",
    selectedShippingAddressId: "",
  });
  checkoutPersistRefs.current.postSubmitNavigation = postSubmitNavigation;
  checkoutPersistRefs.current.selectedPaymentMethod = selectedPaymentMethod;
  checkoutPersistRefs.current.empowerDiscountApplied = empowerDiscountApplied;
  checkoutPersistRefs.current.selectedBillingAddressId = selectedBillingAddressId;
  checkoutPersistRefs.current.selectedShippingAddressId = selectedShippingAddressId;

  /** Copy only: submit always tries `/api/checkout/create-session` first for card; set env to `"false"` for legacy hosted wording. */
  const ewayTokenFlowEnabled =
    typeof process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW !== "string" ||
    process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW !== "false";

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
    watch,
    formState: { errors },
  } = form;
  const getValuesForPersistRef = useRef(getValues);
  getValuesForPersistRef.current = getValues;
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
  const watchedShippingCountry = useWatch({
    control,
    name: "shipping_country",
    defaultValue: "AU",
  });
  const watchedShippingState = useWatch({ control, name: "shipping_state", defaultValue: "" });
  const watchedShippingPostcode = useWatch({
    control,
    name: "shipping_postcode",
    defaultValue: "",
  });
  const watchedShippingCity = useWatch({ control, name: "shipping_city", defaultValue: "" });
  const watchedCustNdis =
    useWatch({ control, name: "cust_woo_ndis_number", defaultValue: "" }) ?? "";
  const watchedLegacyNdis = useWatch({ control, name: "ndis_number", defaultValue: "" }) ?? "";

  const canUseOnAccount = useMemo(() => {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((r: unknown) =>
          String(r || "")
            .trim()
            .toLowerCase()
        )
      : [];
    const isAdmin = roles.includes("administrator");
    const isNdisApprovedRole = roles.includes("ndis-approved");
    const isB2bUser = roles.includes("b2b_user");
    const isB2b30Days = roles.includes("b2b30days");
    const isSupportCoordinator = roles.includes("support_co_ordinator");
    if (isAdmin || isNdisApprovedRole || isB2bUser || isB2b30Days || isSupportCoordinator)
      return true;
    if (user) return false;
    if (sessionStatus !== "unauthenticated") return false;
    const digits = `${watchedCustNdis}${watchedLegacyNdis}`.replace(/\D/g, "");
    return digits.length >= 9;
  }, [user, user?.roles, sessionStatus, watchedCustNdis, watchedLegacyNdis]);

  useEffect(() => {
    if (!canUseOnAccount && selectedPaymentMethod === "cod") {
      setSelectedPaymentMethod("eway");
    }
  }, [canUseOnAccount, selectedPaymentMethod]);

  const onUserPaymentMethodChange = useCallback((method: "eway" | "cod" | "afterpay") => {
    paymentMethodTouchedAtRef.current = Date.now();
    setSelectedPaymentMethod(method);
  }, []);

  /** One-shot apply of first saved address per section (returning customers). */
  const savedAddressHydrationRef = useRef({ billing: false, shipping: false });
  const checkoutDraftHydratedForFingerprintRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (getCartPersistHydrated()) {
      setCartPersistReady(true);
      return;
    }
    return subscribeCartPersistHydrated(() => setCartPersistReady(true));
  }, []);

  const cartReady = useMemo(() => {
    if (!cartPersistReady) return false;
    if (authLoading) return false;
    if (!cartIsHydrated) return false;
    if (user?.id) {
      if (cartLines.length > 0) return true;
      return hasLoadedServerCart;
    }
    return true;
  }, [
    authLoading,
    cartIsHydrated,
    cartLines.length,
    cartPersistReady,
    hasLoadedServerCart,
    user?.id,
  ]);

  useEffect(() => {
    if (cartLines.length === 0) {
      checkoutDraftHydratedForFingerprintRef.current = null;
      paymentMethodTouchedAtRef.current = 0;
      return;
    }
    const fp = cartLinesFingerprint(cartLines);
    if (
      checkoutDraftHydratedForFingerprintRef.current !== null &&
      checkoutDraftHydratedForFingerprintRef.current !== fp
    ) {
      checkoutDraftHydratedForFingerprintRef.current = null;
      paymentMethodTouchedAtRef.current = 0;
    }
  }, [cartLines]);

  useEffect(() => {
    if (!isMounted || !cartReady || cartLines.length === 0) return;
    const fp = cartLinesFingerprint(cartLines);
    if (checkoutDraftHydratedForFingerprintRef.current === fp) return;
    const draft = readCheckoutFormDraft();
    if (!draft) {
      checkoutDraftHydratedForFingerprintRef.current = fp;
      return;
    }
    if (draft.cartFingerprint && draft.cartFingerprint !== fp) {
      clearCheckoutFormDraft();
      checkoutDraftHydratedForFingerprintRef.current = fp;
      return;
    }
    const draftSavedAt =
      typeof draft.savedAt === "number" && Number.isFinite(draft.savedAt) ? draft.savedAt : 0;
    const tid = window.setTimeout(() => {
      const patch = mergeCheckoutFormDraft(draft.form);
      const merged = { ...CHECKOUT_FORM_DEFAULTS, ...patch } as CheckoutFormData;
      form.reset(merged);
      const userPickedPaymentAfterDraft = paymentMethodTouchedAtRef.current > draftSavedAt;
      if (
        !userPickedPaymentAfterDraft &&
        (draft.selectedPaymentMethod === "eway" ||
          draft.selectedPaymentMethod === "cod" ||
          draft.selectedPaymentMethod === "afterpay")
      ) {
        setSelectedPaymentMethod(draft.selectedPaymentMethod);
      }
      if (typeof draft.empowerDiscountApplied === "boolean") {
        setEmpowerDiscountApplied(draft.empowerDiscountApplied);
      }
      if (typeof draft.selectedBillingAddressId === "string") {
        setSelectedBillingAddressId(draft.selectedBillingAddressId);
      }
      if (typeof draft.selectedShippingAddressId === "string") {
        setSelectedShippingAddressId(draft.selectedShippingAddressId);
      }
      const hasBilling =
        Boolean(patch.billing_first_name?.trim()) || Boolean(patch.billing_email?.trim());
      if (hasBilling) savedAddressHydrationRef.current.billing = true;
      if (
        patch.shipToDifferentAddress &&
        (Boolean(patch.shipping_address_1?.trim()) || Boolean(patch.shipping_city?.trim()))
      ) {
        savedAddressHydrationRef.current.shipping = true;
      }
      checkoutDraftHydratedForFingerprintRef.current = fp;
    }, 0);
    return () => clearTimeout(tid);
  }, [isMounted, cartReady, cartLines, form, setSelectedPaymentMethod]);

  useEffect(() => {
    if (!isMounted || cartLines.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = watch(() => {
      if (checkoutPersistRefs.current.postSubmitNavigation) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const fp = cartLinesFingerprint(cartLinesRef.current);
        if (!fp || cartLinesRef.current.length === 0) return;
        writeCheckoutFormDraft({
          version: 1,
          savedAt: Date.now(),
          cartFingerprint: fp,
          form: getValuesForPersistRef.current() as CheckoutFormData,
          selectedPaymentMethod: checkoutPersistRefs.current.selectedPaymentMethod,
          empowerDiscountApplied: checkoutPersistRefs.current.empowerDiscountApplied,
          selectedBillingAddressId: checkoutPersistRefs.current.selectedBillingAddressId,
          selectedShippingAddressId: checkoutPersistRefs.current.selectedShippingAddressId,
        });
      }, 320);
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [isMounted, watch, cartLines.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !isMounted) return;
    const flush = () => {
      if (checkoutPersistRefs.current.postSubmitNavigation) return;
      if (cartLinesRef.current.length === 0) return;
      const fp = cartLinesFingerprint(cartLinesRef.current);
      if (!fp) return;
      writeCheckoutFormDraft({
        version: 1,
        savedAt: Date.now(),
        cartFingerprint: fp,
        form: getValuesForPersistRef.current() as CheckoutFormData,
        selectedPaymentMethod: checkoutPersistRefs.current.selectedPaymentMethod,
        empowerDiscountApplied: checkoutPersistRefs.current.empowerDiscountApplied,
        selectedBillingAddressId: checkoutPersistRefs.current.selectedBillingAddressId,
        selectedShippingAddressId: checkoutPersistRefs.current.selectedShippingAddressId,
      });
    };
    window.addEventListener("pagehide", flush);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isMounted]);

  const cartSubtotal = useMemo(() => parseCartTotal(cartTotalString), [cartTotalString]);
  const subtotal = parseCartTotal(cartTotalString);
  const taxableSubtotal = useMemo(() => calculateTaxableSubtotal(cartLines), [cartLines]);
  const shippingCost = watchedShippingMethod
    ? Number((watchedShippingMethod as ShippingMethodType)?.cost || 0)
    : 0;
  const couponDiscount = couponDiscountAmount || 0;
  const empowerSummary = useMemo(() => getEmpowerDiscountSummary(cartLines), [cartLines]);
  const empowerDiscount = empowerDiscountApplied ? empowerSummary.discountTotal : 0;
  const checkoutDiscountTotal = couponDiscount + empowerDiscount;
  const { gst, orderTotal } = useCheckoutTotals(
    subtotal,
    taxableSubtotal,
    shippingCost,
    checkoutDiscountTotal
  );
  useEffect(() => {
    if (!empowerSummary.applied && empowerDiscountApplied) {
      setEmpowerDiscountApplied(false);
    }
  }, [empowerSummary.applied, empowerDiscountApplied]);

  const onApplyEmpowerDiscount = useCallback(() => {
    if (!empowerSummary.applied) return;
    setEmpowerDiscountApplied(true);
    success("Empower program discount apply");
    console.log("[checkout][empower_discount_apply_clicked]");
  }, [empowerSummary.applied, success]);

  useMountFlag(setIsMounted);

  /**
   * Restoring checkout via browser Back after leaving for eWAY uses the back-forward cache:
   * React state can still show `postSubmitNavigation === "secure_payment"` and `placing === true`
   * even though the redirect already ran. Clear those so the form (or empty cart) renders.
   */
  const runCheckoutRecovery = useCallback(async () => {
    if (typeof window === "undefined" || !isMounted) return;
    cleanupStaleCheckoutSubmitLock();
    if (!hasRecentSubmitLockForRecovery()) {
      setRecoveryBannerVisible(false);
      setRecoveryChecking(false);
      return;
    }

    recoveryAbortRef.current?.abort();
    const ac = new AbortController();
    recoveryAbortRef.current = ac;

    setRecoveryBannerVisible(true);
    setRecoveryChecking(true);
    const sessionId = ensureCheckoutSessionId();
    const lockRequestId = readActiveSubmitId();
    console.log("[checkout][recovery_triggered]", { requestId: lockRequestId ?? undefined });

    type LastStatusJson = {
      hasRecentOrder?: boolean;
      woo_order_id?: number;
      status?: string;
      order_key?: string;
    };

    try {
      const res = await fetch(
        `/api/checkout/last-status?session_id=${encodeURIComponent(sessionId)}`,
        { credentials: "include", cache: "no-store", signal: ac.signal }
      );
      const headerRid = res.headers.get("x-request-id")?.trim();
      const json = (await res.json()) as LastStatusJson;
      if (ac.signal.aborted) return;

      const rid = headerRid || lockRequestId || undefined;

      if (json.hasRecentOrder && json.woo_order_id != null) {
        const st = String(json.status || "").toLowerCase();
        console.log("[checkout][recovered_order]", {
          requestId: rid,
          woo_order_id: json.woo_order_id,
          status: st,
        });
        if (st === "processing" || st === "completed" || st === "on-hold") {
          clearCheckoutSubmitLock();
          clearCheckoutFormDraft();
          router.replace(`/thank-you?order=${encodeURIComponent(String(json.woo_order_id))}`, {
            scroll: false,
          });
          return;
        }
        if (st === "pending") {
          clearCheckoutSubmitLock();
          const oid = String(json.woo_order_id);
          const keyQs =
            typeof json.order_key === "string" && json.order_key.trim() !== ""
              ? `&key=${encodeURIComponent(json.order_key.trim())}`
              : "";
          router.replace(
            `/checkout/order-review?orderId=${encodeURIComponent(oid)}${keyQs}&pm=${encodeURIComponent("eway")}`,
            { scroll: false }
          );
          return;
        }
      }

      clearCheckoutSubmitLock();
      setPlacing(false);
      submitGuardRef.current = false;
      redirectPendingRef.current = false;
      setPostSubmitNavigation(null);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      clearCheckoutSubmitLock();
      setPlacing(false);
      submitGuardRef.current = false;
      redirectPendingRef.current = false;
    } finally {
      if (!ac.signal.aborted) {
        setRecoveryChecking(false);
        setRecoveryBannerVisible(false);
      }
    }
  }, [ensureCheckoutSessionId, isMounted, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setPostSubmitNavigation(null);
        setPlacing(false);
        submitGuardRef.current = false;
        redirectPendingRef.current = false;
      }
      void runCheckoutRecovery();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [runCheckoutRecovery]);

  useEffect(() => {
    if (!isMounted) return;
    void runCheckoutRecovery();
    return () => recoveryAbortRef.current?.abort();
  }, [isMounted, runCheckoutRecovery]);

  useEffect(() => {
    if (!placing) {
      setPlacingSubmitPhase("idle");
    }
  }, [placing]);

  /**
   * eWAY path does not clear the cart before redirect. An empty cart plus `secure_payment`
   * usually means stale UI (hydration gap or abandoned redirect); avoid infinite spinner on `/checkout`.
   */
  useEffect(() => {
    if (postSubmitNavigation !== "secure_payment") return;
    const id = window.requestAnimationFrame(() => {
      if (cartLinesRef.current.length > 0) return;
      setPostSubmitNavigation(null);
      setPlacing(false);
      submitGuardRef.current = false;
      redirectPendingRef.current = false;
    });
    return () => window.cancelAnimationFrame(id);
  }, [postSubmitNavigation, cartLines.length]);

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
    lastSignedQuoteRef.current = null;
    quoteEpochRef.current += 1;
    const epoch = quoteEpochRef.current;
    const ac = new AbortController();
    quoteFetchAbortRef.current = ac;
    const timer = window.setTimeout(() => {
      if (quoteEpochRef.current !== epoch) return;

      const linesSnapshot = cartLinesRef.current;
      const data = getValues() as CheckoutFormData;
      const body = buildCheckoutQuoteTotalsBody({
        data,
        cartLines: linesSnapshot,
        appliedCoupon,
        empowerApplied: empowerDiscountApplied,
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
            shippingAdjusted?: boolean;
            shippingLine?: {
              method_id: string;
              method_title: string;
            };
            quote_signature?: string;
            quote_snapshot?: CheckoutQuoteSnapshotV1;
          };

          if (!res.ok || !json.success || !json.totals) {
            if (quoteEpochRef.current === epoch) setServerTotals(null);
            return;
          }

          if (json.quote_signature && json.quote_snapshot) {
            lastSignedQuoteRef.current = {
              signature: json.quote_signature,
              snapshot: json.quote_snapshot,
            };
          } else {
            lastSignedQuoteRef.current = null;
          }

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
      if (quoteFetchAbortRef.current === ac) quoteFetchAbortRef.current = null;
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

  /**
   * `serverTotals.discount` is often `0` (valid) when the quote path omits the coupon; `??` does not
   * fall through for `0`, so the order summary was clobbering the client-validated discount and total.
   */
  const serverQuoteOmittingCoupon = useMemo(() => {
    if (appliedCoupon == null || couponDiscount <= 0) return false;
    if (serverTotals == null) return false;
    return serverTotals.discount === 0;
  }, [appliedCoupon, couponDiscount, serverTotals]);

  const summarySubtotal = serverTotals?.subtotal ?? subtotal;
  const summaryShipping = serverTotals?.shipping ?? shippingCost;
  const summaryDiscount = serverQuoteOmittingCoupon
    ? couponDiscount
    : serverTotals != null && typeof serverTotals.discount === "number"
      ? serverTotals.discount
      : couponDiscount;
  const summaryGst = serverQuoteOmittingCoupon ? gst : (serverTotals?.gst ?? gst);
  const summaryOrderTotal = serverQuoteOmittingCoupon
    ? orderTotal
    : (serverTotals?.total ?? orderTotal);
  const summaryCartSubtotal = serverTotals?.subtotal ?? cartSubtotal;
  const selectedShippingMethodLabel = useMemo(() => {
    const sm = watchedShippingMethod as ShippingMethodType | undefined;
    return (sm?.label || "").trim();
  }, [watchedShippingMethod]);

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
  const replaceInternalCheckoutPath = useCallback(
    (path: string) => {
      router.replace(path, { scroll: false });
    },
    [router]
  );

  const onSubmit = useCallback(
    async (data: CheckoutFormData) => {
      if (placing) return;
      quoteEpochRef.current += 1;
      quoteFetchAbortRef.current?.abort();
      quoteFetchAbortRef.current = null;
      setPlacingSubmitPhase("payment");
      if (shouldBlockSubmitDueToRecentLock()) {
        const blockedId = readActiveSubmitId();
        console.log("[checkout][submit_blocked]", { requestId: blockedId ?? undefined });
        showError("Please wait a moment before trying again.");
        setPlacing(false);
        return;
      }
      const submitId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeCheckoutSubmitLock(submitId);
      console.log("[checkout][submit_started]", { requestId: submitId });

      const linesForOrder = getActiveCartSnapshot();
      if (process.env.NODE_ENV === "development") {
        console.log("[checkout] placing order with Zustand lines:", linesForOrder);
      }
      await submitCheckoutOrder({
        data,
        cartLines: linesForOrder,
        checkoutSessionId: ensureCheckoutSessionId(),
        selectedPaymentMethod: selectedPaymentMethodRef.current,
        ewayTokenFlowEnabled,
        appliedCoupon,
        couponSearchParam: searchParams.get("coupon"),
        empowerApplied: empowerDiscountApplied,
        showError,
        success,
        clearLocalCart,
        userId: user?.id,
        setPostSubmitNavigation,
        submitGuardRef,
        redirectPendingRef,
        replaceInternalPath: replaceInternalCheckoutPath,
        setPlacing,
        signedQuote: lastSignedQuoteRef.current,
      });
    },
    [
      placing,
      showError,
      ewayTokenFlowEnabled,
      appliedCoupon,
      empowerDiscountApplied,
      searchParams,
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
    cartReady,
    cartLines,
    subtotal: summarySubtotal,
    cartSubtotal: summaryCartSubtotal,
    couponDiscount: summaryDiscount,
    empowerDiscount,
    empowerDiscountEligible: empowerSummary.applied,
    empowerDiscountApplied,
    onApplyEmpowerDiscount,
    appliedCoupon,
    shippingCost: summaryShipping,
    selectedShippingMethodLabel,
    gst: summaryGst,
    orderTotal: summaryOrderTotal,
    totalsQuoteLoading,
    postSubmitNavigation,
    placing,
    placingSubmitPhase,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    onUserPaymentMethodChange,
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
    recoveryBannerVisible,
    recoveryChecking,
    watch,
    getValues,
  };
}
