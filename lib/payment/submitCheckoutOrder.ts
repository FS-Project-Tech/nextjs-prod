import type { MutableRefObject } from "react";
import type { CartItem } from "@/lib/types/cart";
import type { CheckoutQuoteSigningPayload } from "@/types/checkout";
import type { CheckoutFormData, ShippingMethodType } from "@/lib/checkout/schema";
import { buildCreateOrderPayload } from "@/lib/checkout/buildCreateOrderPayload";
import {
  readCheckoutJsonOrRecoverHeaders,
  handleTokenHandoffJson,
  handleHostedRedirectJson,
  handleCashOnDeliveryCompleteJson,
  reportCreateOrderFailure,
  goToOrderReview,
  type CheckoutOutcomeDeps,
} from "./checkoutOutcomeHandlers";
import { messageFromCreateOrderError } from "./createOrderHttp";
import { submitAfterpayCheckout } from "./submitAfterpayCheckout";
import { clearCheckoutSubmitLock } from "@/lib/checkout/checkoutSubmitSession";

export type SubmitCheckoutOrderArgs = {
  data: CheckoutFormData;
  cartLines: CartItem[];
  checkoutSessionId: string;
  selectedPaymentMethod: "eway" | "cod" | "afterpay";
  /** @deprecated Token flow is always tried first for eWAY; prop kept for UI copy (PaymentSection). */
  ewayTokenFlowEnabled: boolean;
  appliedCoupon: { code: string } | null;
  couponSearchParam: string | null;
  empowerApplied?: boolean;
  showError: (message: string) => void;
  success: (message: string) => void;
  clearLocalCart: () => void;
  userId?: string;
  setPostSubmitNavigation: (phase: "secure_payment" | "order_confirmation") => void;
  submitGuardRef: MutableRefObject<boolean>;
  redirectPendingRef: MutableRefObject<boolean>;
  replaceInternalPath: (path: string) => void;
  setPlacing: (busy: boolean) => void;
  /** Latest signed quote from `/api/checkout/quote-totals` — required for fast eWAY create-session. */
  signedQuote?: CheckoutQuoteSigningPayload | null;
};

export async function submitCheckoutOrder(args: SubmitCheckoutOrderArgs): Promise<void> {
  const {
    data,
    cartLines,
    checkoutSessionId,
    selectedPaymentMethod,
    ewayTokenFlowEnabled: _ewayTokenFlowIgnored,
    appliedCoupon,
    couponSearchParam,
    empowerApplied,
    showError,
    success,
    clearLocalCart,
    userId,
    setPostSubmitNavigation,
    submitGuardRef,
    redirectPendingRef,
    replaceInternalPath,
    setPlacing,
    signedQuote,
  } = args;

  if (submitGuardRef.current) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[checkout] duplicate submit ignored (already in flight)");
    }
    return;
  }
  submitGuardRef.current = true;
  redirectPendingRef.current = false;

  if (cartLines.length === 0) {
    submitGuardRef.current = false;
    clearCheckoutSubmitLock();
    showError("Your cart is empty");
    return;
  }

  setPlacing(true);

  const shippingMethodData = data.shippingMethod as ShippingMethodType | undefined;
  if (!shippingMethodData?.id) {
    showError("Please select a shipping method.");
    submitGuardRef.current = false;
    setPlacing(false);
    return;
  }

  if (selectedPaymentMethod === "afterpay") {
    try {
      await submitAfterpayCheckout({
        data,
        cartLines,
        checkoutSessionId,
        appliedCoupon,
        couponSearchParam,
        empowerApplied,
        signedQuote,
        showError,
        redirectPendingRef,
        setPlacing,
      });
    } finally {
      submitGuardRef.current = false;
      if (!redirectPendingRef.current) {
        clearCheckoutSubmitLock();
        setPlacing(false);
      }
    }
    return;
  }

  void _ewayTokenFlowIgnored;

  const outcomeDeps: CheckoutOutcomeDeps = {
    toast: { error: showError, success },
    clearLocalCart,
    userId,
    setPostSubmitNavigation,
    redirectPendingRef,
    replaceInternalPath,
  };

  try {
    const payload = buildCreateOrderPayload({
      data,
      cartLines,
      paymentMethod: selectedPaymentMethod,
      appliedCouponCode: appliedCoupon?.code ?? null,
      couponFromUrl: couponSearchParam,
      checkoutSessionId,
      empowerApplied,
      quoteSigning: selectedPaymentMethod === "eway" ? signedQuote ?? null : null,
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[checkout] POST checkout line_items (Zustand → Woo order):", payload.line_items);
    }

    const origin =
      typeof window !== "undefined" && typeof window.location?.origin === "string"
        ? window.location.origin
        : "";

    const idempotencyKey =
      checkoutSessionId.trim() ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

    const fetchInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    };

    const applyHostedCheckoutJson = (res: Response, apiJson: Record<string, unknown>): void => {
      if (!res.ok || apiJson.success === false || apiJson.success === "false") {
        if (apiJson.action === "resume_payment") {
          const oidRaw = apiJson.order_id ?? apiJson.orderId;
          const oid = oidRaw != null && String(oidRaw).trim() !== "" ? String(oidRaw).trim() : "";
          const key =
            typeof apiJson.order_key === "string" && apiJson.order_key.trim()
              ? apiJson.order_key.trim()
              : null;
          if (oid) {
            outcomeDeps.toast.error(
              messageFromCreateOrderError(apiJson) ||
                "Payment could not start. Opening order review so you can try again.",
            );
            goToOrderReview(oid, "eway", outcomeDeps, key);
            return;
          }
        }
        reportCreateOrderFailure(res, apiJson, outcomeDeps.toast);
        return;
      }

      if (apiJson.success !== true && apiJson.success !== "true") {
        showError("Checkout did not complete successfully.");
        return;
      }

      const inner =
        apiJson.data !== null && typeof apiJson.data === "object" && !Array.isArray(apiJson.data)
          ? (apiJson.data as Record<string, unknown>)
          : null;

      /** Merge root-level fields so eWAY redirect works even if `data` is partial or missing. */
      const orderPayload: Record<string, unknown> = {
        ...(inner ?? {}),
        ...(typeof apiJson.redirect_url === "string" && apiJson.redirect_url.trim()
          ? { redirect_url: apiJson.redirect_url.trim() }
          : {}),
        ...(apiJson.order_id != null && apiJson.order_id !== ""
          ? { order_id: apiJson.order_id }
          : {}),
        ...(typeof apiJson.order_key === "string" && apiJson.order_key.trim()
          ? { order_key: apiJson.order_key.trim() }
          : {}),
      };

      if (handleCashOnDeliveryCompleteJson(orderPayload, outcomeDeps)) return;

      if (handleHostedRedirectJson(orderPayload, setPostSubmitNavigation, redirectPendingRef))
        return;

      showError("Unexpected checkout response. Please contact support.");
    };

    if (selectedPaymentMethod === "eway") {
      let res = await fetch(`${origin}/api/checkout/create-session`, fetchInit);
      let { apiJson, recoveredEarly } = await readCheckoutJsonOrRecoverHeaders(res, outcomeDeps);
      if (recoveredEarly) return;

      const useHostedFallback =
        res.status === 503 &&
        typeof apiJson.error === "string" &&
        apiJson.error.includes("CHECKOUT_SESSION_SERVER_SECRET");

      if (useHostedFallback) {
        res = await fetch(`${origin}/api/checkout`, fetchInit);
        ({ apiJson, recoveredEarly } = await readCheckoutJsonOrRecoverHeaders(res, outcomeDeps));
        if (recoveredEarly) return;
        applyHostedCheckoutJson(res, apiJson);
        return;
      }

      handleTokenHandoffJson(
        res,
        apiJson,
        outcomeDeps.toast,
        setPostSubmitNavigation,
        redirectPendingRef,
      );
      return;
    }

    const res = await fetch(`${origin}/api/checkout`, fetchInit);
    const { apiJson, recoveredEarly } = await readCheckoutJsonOrRecoverHeaders(res, outcomeDeps);
    if (recoveredEarly) return;
    applyHostedCheckoutJson(res, apiJson);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred while placing your order";
    showError(message);
  } finally {
    submitGuardRef.current = false;
    if (!redirectPendingRef.current) {
      clearCheckoutSubmitLock();
      setPlacing(false);
    }
  }
}