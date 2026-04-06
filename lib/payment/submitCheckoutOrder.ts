import type { MutableRefObject } from "react";
import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData, ShippingMethodType } from "@/lib/checkout/schema";
import { buildCreateOrderPayload } from "@/lib/checkout/buildCreateOrderPayload";
import {
  readCheckoutJsonOrRecoverHeaders,
  handleTokenHandoffJson,
  handleHostedRedirectJson,
  handleCashOnDeliveryCompleteJson,
  reportCreateOrderFailure,
  type CheckoutOutcomeDeps,
} from "./checkoutOutcomeHandlers";

export type SubmitCheckoutOrderArgs = {
  data: CheckoutFormData;
  cartLines: CartItem[];
  selectedPaymentMethod: "eway" | "cod";
  ewayTokenFlowEnabled: boolean;
  appliedCoupon: { code: string } | null;
  couponSearchParam: string | null;
  showError: (message: string) => void;
  success: (message: string) => void;
  clearLocalCart: () => void;
  userId?: string;
  setPostSubmitNavigation: (phase: "secure_payment" | "order_confirmation") => void;
  submitGuardRef: MutableRefObject<boolean>;
  redirectPendingRef: MutableRefObject<boolean>;
  replaceInternalPath: (path: string) => void;
  setPlacing: (busy: boolean) => void;
};

function checkoutEndpoint(
  paymentMethod: "eway" | "cod",
  tokenFlow: boolean
): "/api/checkout/create-session" | "/api/checkout" {
  const useTokenHandoff = paymentMethod === "eway" && tokenFlow;
  return useTokenHandoff ? "/api/checkout/create-session" : "/api/checkout";
}

export async function submitCheckoutOrder(args: SubmitCheckoutOrderArgs): Promise<void> {
  const {
    data,
    cartLines,
    selectedPaymentMethod,
    ewayTokenFlowEnabled,
    appliedCoupon,
    couponSearchParam,
    showError,
    success,
    clearLocalCart,
    userId,
    setPostSubmitNavigation,
    submitGuardRef,
    redirectPendingRef,
    replaceInternalPath,
    setPlacing,
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

  const useTokenHandoff = selectedPaymentMethod === "eway" && ewayTokenFlowEnabled;
  const endpoint = checkoutEndpoint(selectedPaymentMethod, ewayTokenFlowEnabled);

  /** COD / card: `POST /api/checkout` builds the Woo order from JSON line items (no Store API cart). */

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
    });

    const requestUrl =
      typeof window !== "undefined" ? new URL(endpoint, window.location.origin).href : endpoint;

    const res = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(useTokenHandoff && typeof crypto !== "undefined" && "randomUUID" in crypto
          ? { "Idempotency-Key": crypto.randomUUID() }
          : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    const { apiJson, recoveredEarly } = await readCheckoutJsonOrRecoverHeaders(res, outcomeDeps);
    if (recoveredEarly) return;

    if (useTokenHandoff) {
      handleTokenHandoffJson(
        res,
        apiJson,
        outcomeDeps.toast,
        setPostSubmitNavigation,
        redirectPendingRef
      );
      return;
    }

    if (!res.ok || apiJson.success === false || apiJson.success === "false") {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred while placing your order";
    showError(message);
  } finally {
    submitGuardRef.current = false;
    if (!redirectPendingRef.current) {
      setPlacing(false);
    }
  }
}
