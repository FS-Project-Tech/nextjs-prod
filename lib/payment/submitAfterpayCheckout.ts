import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { buildCreateOrderPayload } from "@/lib/checkout/buildCreateOrderPayload";
import type { MutableRefObject } from "react";
import { clearCheckoutSubmitLock } from "@/lib/checkout/checkoutSubmitSession";

export async function submitAfterpayCheckout(args: {
  data: CheckoutFormData;
  cartLines: CartItem[];
  checkoutSessionId: string;
  appliedCoupon: { code: string } | null;
  couponSearchParam: string | null;
  empowerApplied?: boolean;
  showError: (message: string) => void;
  redirectPendingRef: MutableRefObject<boolean>;
  setPlacing: (busy: boolean) => void;
}): Promise<void> {
  const {
    data,
    cartLines,
    checkoutSessionId,
    appliedCoupon,
    couponSearchParam,
    empowerApplied,
    showError,
    redirectPendingRef,
    setPlacing,
  } = args;

  const payload = buildCreateOrderPayload({
    data,
    cartLines,
    paymentMethod: "afterpay",
    appliedCouponCode: appliedCoupon?.code ?? null,
    couponFromUrl: couponSearchParam,
    checkoutSessionId,
    empowerApplied,
  });

  const requestUrl =
    typeof window !== "undefined"
      ? new URL("/api/afterpay/create-checkout", window.location.origin).href
      : "/api/afterpay/create-checkout";

  const idempotencyKey =
    checkoutSessionId.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

  try {
    const res = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }

    if (!res.ok || json.success === false || json.success === "false") {
      const msg =
        typeof json.error === "string" && json.error.trim()
          ? json.error.trim()
          : `Could not start Afterpay (HTTP ${res.status}).`;
      showError(msg);
      redirectPendingRef.current = false;
      clearCheckoutSubmitLock();
      setPlacing(false);
      return;
    }

    const redirectUrl =
      typeof json.redirectCheckoutUrl === "string" ? json.redirectCheckoutUrl.trim() : "";
    if (!redirectUrl) {
      showError("Afterpay did not return a redirect URL. Please choose another payment method.");
      clearCheckoutSubmitLock();
      setPlacing(false);
      return;
    }

    clearCheckoutSubmitLock();
    redirectPendingRef.current = true;
    queueMicrotask(() => {
      window.location.assign(redirectUrl);
    });
  } catch (e) {
    redirectPendingRef.current = false;
    clearCheckoutSubmitLock();
    setPlacing(false);
    showError(e instanceof Error ? e.message : "Afterpay checkout could not start.");
  }
}
