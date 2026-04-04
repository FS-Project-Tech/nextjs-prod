import type { MutableRefObject } from "react";
import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData, ShippingMethodType } from "@/lib/checkout/schema";
import { buildCreateOrderPayload } from "@/lib/checkout/buildCreateOrderPayload";
import {
  readCheckoutJsonOrRecoverHeaders,
  handleTokenHandoffJson,
  handleHostedRedirectJson,
  handleCodSuccessJson,
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
  setPlacing: (busy: boolean) => void;
};

function checkoutEndpoint(
  paymentMethod: "eway" | "cod",
  tokenFlow: boolean
): "/api/checkout/create-session" | "/api/checkout/create-order" {
  const useTokenHandoff = paymentMethod === "eway" && tokenFlow;
  return useTokenHandoff ? "/api/checkout/create-session" : "/api/checkout/create-order";
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
    setPlacing,
  } = args;

  if (submitGuardRef.current) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[checkout] duplicate submit ignored (already in flight)");
    }
    return;
  }
  submitGuardRef.current = true;

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

  const outcomeDeps: CheckoutOutcomeDeps = {
    toast: { error: showError, success },
    clearLocalCart,
    userId,
    setPostSubmitNavigation,
  };

  try {
    const payload = buildCreateOrderPayload({
      data,
      cartLines,
      paymentMethod: selectedPaymentMethod,
      appliedCouponCode: appliedCoupon?.code ?? null,
      couponFromUrl: couponSearchParam,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useTokenHandoff && typeof crypto !== "undefined" && "randomUUID" in crypto
          ? { "Idempotency-Key": crypto.randomUUID() }
          : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "same-origin",
    });

    const { apiJson, recoveredEarly } = await readCheckoutJsonOrRecoverHeaders(
      res,
      outcomeDeps,
      selectedPaymentMethod
    );
    if (recoveredEarly) return;

    if (useTokenHandoff) {
      handleTokenHandoffJson(res, apiJson, outcomeDeps.toast, setPostSubmitNavigation);
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

    const orderPayload =
      apiJson.data !== null && typeof apiJson.data === "object" && !Array.isArray(apiJson.data)
        ? (apiJson.data as Record<string, unknown>)
        : apiJson;

    if (handleHostedRedirectJson(orderPayload, setPostSubmitNavigation)) return;

    if (handleCodSuccessJson(orderPayload, outcomeDeps)) return;

    showError("Unexpected checkout response. Please contact support.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred while placing your order";
    showError(message);
  } finally {
    submitGuardRef.current = false;
    setPlacing(false);
  }
}
