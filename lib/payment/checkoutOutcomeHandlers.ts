import type { MutableRefObject } from "react";
import {
  readResponseBodyText,
  pickCreateOrderIdFromHeaders,
  pickCreateOrderKeyFromHeaders,
  messageFromCreateOrderError,
  checkoutResponseIndicatesCod,
  parseCheckoutMirrorFromResponse,
} from "./createOrderHttp";

export type CheckoutToast = { error: (m: string) => void; success: (m: string) => void };

export type CheckoutOutcomeDeps = {
  toast: CheckoutToast;
  clearLocalCart: () => void;
  userId?: string;
  setPostSubmitNavigation: (phase: "secure_payment" | "order_confirmation") => void;
  /** Set when a full-page redirect is scheduled so the submit handler can keep "placing" until unload. */
  redirectPendingRef: MutableRefObject<boolean>;
  /** Client-side navigation for same-origin checkout paths (e.g. order review). */
  replaceInternalPath: (path: string) => void;
};

/**
 * External payment / gateway URLs must use full navigation.
 * Deferred one microtask so the fetch response can finalize (DevTools / network).
 */
function assignExternalUrl(
  href: string,
  redirectPendingRef: MutableRefObject<boolean>
): void {
  redirectPendingRef.current = true;
  queueMicrotask(() => {
    window.location.assign(href);
  });
}

function replaceInternalCheckoutPath(path: string, deps: CheckoutOutcomeDeps): void {
  deps.redirectPendingRef.current = true;
  queueMicrotask(() => {
    deps.replaceInternalPath(path);
  });
}

export function goToOrderReview(
  orderId: string,
  paymentHint: string | undefined,
  deps: CheckoutOutcomeDeps,
  orderKey?: string | null
): void {
  const hint =
    paymentHint && paymentHint.trim() !== ""
      ? `&pm=${encodeURIComponent(paymentHint.trim())}`
      : "";
  const keyQs =
    orderKey && orderKey.trim() !== ""
      ? `&key=${encodeURIComponent(orderKey.trim())}`
      : "";
  replaceInternalCheckoutPath(
    `/checkout/order-review?orderId=${encodeURIComponent(orderId)}${keyQs}${hint}`,
    deps
  );
}

export async function readCheckoutJsonOrRecoverHeaders(
  res: Response,
  deps: CheckoutOutcomeDeps
): Promise<{ apiJson: Record<string, unknown>; recoveredEarly: boolean }> {
  /** One body read (no clone) — avoids rare empty/locked streams after clone.json(). */
  let responseText = "";
  try {
    responseText = await readResponseBodyText(res);
  } catch {
    const mirror = parseCheckoutMirrorFromResponse(res);
    if (mirror) return { apiJson: mirror, recoveredEarly: false };
    if (recoverPlacedCodOrderFromHeaders(res, deps)) {
      return { apiJson: {}, recoveredEarly: true };
    }
    const recoveredId = pickCreateOrderIdFromHeaders(res);
    if (recoveredId) {
      const recoveredKey = pickCreateOrderKeyFromHeaders(res);
      finalizeRecoveredOrderId(deps, recoveredId, recoveredKey);
      return { apiJson: {}, recoveredEarly: true };
    }
    deps.toast.error(
      "Could not read the checkout response. Check your connection and try again once."
    );
    return { apiJson: {}, recoveredEarly: true };
  }

  const trimmed = responseText.trim();
  if (trimmed) {
    try {
      const apiJson = JSON.parse(trimmed) as Record<string, unknown>;
      if (apiJson !== null && typeof apiJson === "object" && !Array.isArray(apiJson)) {
        return { apiJson, recoveredEarly: false };
      }
    } catch {
      const mirror = parseCheckoutMirrorFromResponse(res);
      if (mirror) return { apiJson: mirror, recoveredEarly: false };
      deps.toast.error(
        !res.ok
          ? `Checkout service error (HTTP ${res.status}). Please try again.`
          : "Checkout returned an unexpected response. Please try again or contact support."
      );
      return { apiJson: {}, recoveredEarly: true };
    }
    const mirrorAfterShape = parseCheckoutMirrorFromResponse(res);
    if (mirrorAfterShape) return { apiJson: mirrorAfterShape, recoveredEarly: false };
    deps.toast.error(
      !res.ok
        ? `Checkout service error (HTTP ${res.status}). Please try again.`
        : "Checkout returned an unexpected response. Please try again or contact support."
    );
    return { apiJson: {}, recoveredEarly: true };
  }

  const mirror = parseCheckoutMirrorFromResponse(res);
  if (mirror) return { apiJson: mirror, recoveredEarly: false };

  if (!trimmed) {
    if (!res.ok) {
      deps.toast.error(`Checkout service error (HTTP ${res.status}). Please try again.`);
      return { apiJson: {}, recoveredEarly: true };
    }
    if (recoverPlacedCodOrderFromHeaders(res, deps)) {
      return { apiJson: {}, recoveredEarly: true };
    }
    const recoveredId = pickCreateOrderIdFromHeaders(res);
    if (recoveredId) {
      const recoveredKey = pickCreateOrderKeyFromHeaders(res);
      finalizeRecoveredOrderId(deps, recoveredId, recoveredKey);
      return { apiJson: {}, recoveredEarly: true };
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[checkout] create-order returned OK but empty body", {
        status: res.status,
        url: res.url,
      });
    }
    deps.toast.error(
      "Empty response from checkout server. If this persists, check the Network tab for the create-order request."
    );
    return { apiJson: {}, recoveredEarly: true };
  }
}

function finalizeRecoveredOrderId(
  deps: CheckoutOutcomeDeps,
  orderId: string,
  orderKey: string | null
): void {
  deps.setPostSubmitNavigation("order_confirmation");
  goToOrderReview(orderId, undefined, deps, orderKey);
}

function persistEmptyServerCart(userId?: string): void {
  if (!userId) return;
  fetch("/api/dashboard/cart/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items: [] }),
  }).catch(() => {});
}

/**
 * When the JSON body is missing but COD succeeded, headers carry order id + cod hint.
 * Clears cart and navigates to order review (same as a normal COD JSON success).
 */
export function recoverPlacedCodOrderFromHeaders(res: Response, deps: CheckoutOutcomeDeps): boolean {
  if (!res.ok || !checkoutResponseIndicatesCod(res)) return false;
  const orderId = pickCreateOrderIdFromHeaders(res);
  if (!orderId) return false;
  const orderKey = pickCreateOrderKeyFromHeaders(res);
  deps.setPostSubmitNavigation("order_confirmation");
  try {
    sessionStorage.setItem(`headless_clear_cart_for_order_${orderId}`, "1");
  } catch {
    /* ignore */
  }
  try {
    deps.clearLocalCart();
    persistEmptyServerCart(deps.userId);
  } catch {
    /* ignore */
  }
  deps.toast.success("Order placed successfully.");
  goToOrderReview(orderId, undefined, deps, orderKey);
  return true;
}

/** After `/api/checkout/create-order` with cash on delivery (no eWAY redirect). */
export function handleCashOnDeliveryCompleteJson(
  payload: Record<string, unknown>,
  deps: CheckoutOutcomeDeps
): boolean {
  if (payload.type !== "order_placed" || payload.payment_method !== "cod") return false;

  const orderIdRaw = payload.orderId ?? payload.order_ref ?? payload.order_id;
  if (orderIdRaw == null || String(orderIdRaw).trim() === "") return false;

  const orderKey =
    typeof payload.order_key === "string" && payload.order_key.trim() !== ""
      ? payload.order_key.trim()
      : null;

  deps.setPostSubmitNavigation("order_confirmation");
  try {
    sessionStorage.setItem(`headless_clear_cart_for_order_${String(orderIdRaw)}`, "1");
  } catch {
    /* ignore */
  }
  try {
    deps.clearLocalCart();
    persistEmptyServerCart(deps.userId);
  } catch {
    /* ignore */
  }
  deps.toast.success("Order placed successfully.");
  goToOrderReview(String(orderIdRaw), undefined, deps, orderKey);
  return true;
}

function unwrapSuccessData(apiJson: Record<string, unknown>): Record<string, unknown> {
  if (
    apiJson.success === true &&
    apiJson.data !== null &&
    typeof apiJson.data === "object" &&
    !Array.isArray(apiJson.data)
  ) {
    return apiJson.data as Record<string, unknown>;
  }
  return apiJson;
}

export function handleTokenHandoffJson(
  res: Response,
  apiJson: Record<string, unknown>,
  toast: CheckoutToast,
  setPostSubmitNavigation: (p: "secure_payment" | "order_confirmation") => void,
  redirectPendingRef: MutableRefObject<boolean>
): boolean {
  if (!res.ok || apiJson.success === false || apiJson.success === "false") {
    const detail = messageFromCreateOrderError(apiJson);
    toast.error(
      detail || `Unable to start secure checkout${!res.ok ? ` (HTTP ${res.status})` : ""}.`
    );
    return true;
  }
  const data = unwrapSuccessData(apiJson);
  const redirectUrl = typeof data.redirectUrl === "string" ? data.redirectUrl.trim() : "";
  if (!redirectUrl) {
    const errMsg =
      (typeof data.error === "string" && data.error) ||
      (typeof apiJson.error === "string" && apiJson.error) ||
      "Secure checkout redirect URL was not returned.";
    toast.error(errMsg);
    return true;
  }
  try {
    sessionStorage.setItem("headless_clear_cart_after_woo_token_checkout", "1");
  } catch {
    /* ignore */
  }
  setPostSubmitNavigation("secure_payment");
  assignExternalUrl(redirectUrl, redirectPendingRef);
  return true;
}

export function handleHostedRedirectJson(
  apiJson: Record<string, unknown>,
  setPostSubmitNavigation: (p: "secure_payment" | "order_confirmation") => void,
  redirectPendingRef: MutableRefObject<boolean>
): boolean {
  if (apiJson.type !== "redirect" || typeof apiJson.url !== "string" || !apiJson.url.trim()) {
    return false;
  }
  const payUrl = apiJson.url.trim();
  try {
    const oid = apiJson.orderId ?? apiJson.order_ref;
    if (oid != null && String(oid).trim() !== "") {
      sessionStorage.setItem(`headless_clear_cart_for_order_${String(oid)}`, "1");
    }
  } catch {
    /* ignore */
  }
  setPostSubmitNavigation("secure_payment");
  assignExternalUrl(payUrl, redirectPendingRef);
  return true;
}

export function reportCreateOrderFailure(
  res: Response,
  apiJson: Record<string, unknown>,
  toast: CheckoutToast
): void {
  const detail = messageFromCreateOrderError(apiJson);
  toast.error(
    detail ||
      `Unable to place order${!res.ok ? ` (HTTP ${res.status})` : ""}. Please try again or contact support.`
  );
}
