import {
  readResponseBodyText,
  pickCreateOrderIdFromHeaders,
  messageFromCreateOrderError,
} from "./createOrderHttp";

export type CheckoutToast = { error: (m: string) => void; success: (m: string) => void };

export type CheckoutOutcomeDeps = {
  toast: CheckoutToast;
  clearLocalCart: () => void;
  userId?: string;
  setPostSubmitNavigation: (phase: "secure_payment" | "order_confirmation") => void;
};

function persistEmptyServerCart(userId?: string): void {
  if (!userId) return;
  fetch("/api/dashboard/cart/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items: [] }),
  }).catch(() => {});
}

export function goToOrderReview(orderId: string): void {
  window.location.assign(`/order-review?order_id=${encodeURIComponent(orderId)}`);
}

export async function readCheckoutJsonOrRecoverHeaders(
  res: Response,
  deps: CheckoutOutcomeDeps,
  paymentMethod: "eway" | "cod"
): Promise<{ apiJson: Record<string, unknown>; recoveredEarly: boolean }> {
  let responseText = "";
  try {
    responseText = (await readResponseBodyText(res)).replace(/^\uFEFF/, "");
  } catch {
    const recoveredId = pickCreateOrderIdFromHeaders(res);
    if (recoveredId) {
      finalizeRecoveredOrderId(deps, paymentMethod, recoveredId);
      return { apiJson: {}, recoveredEarly: true };
    }
    deps.toast.error(
      "Could not read the checkout response. Check your connection and try again once."
    );
    return { apiJson: {}, recoveredEarly: true };
  }

  const trimmed = responseText.trim();
  if (!trimmed) {
    if (!res.ok) {
      deps.toast.error(`Checkout service error (HTTP ${res.status}). Please try again.`);
      return { apiJson: {}, recoveredEarly: true };
    }
    const recoveredId = pickCreateOrderIdFromHeaders(res);
    if (recoveredId) {
      finalizeRecoveredOrderId(deps, paymentMethod, recoveredId);
      return { apiJson: {}, recoveredEarly: true };
    }
    deps.toast.error(
      "Empty response from checkout server. If this persists, check the Network tab for the create-order request."
    );
    return { apiJson: {}, recoveredEarly: true };
  }

  try {
    return { apiJson: JSON.parse(trimmed) as Record<string, unknown>, recoveredEarly: false };
  } catch {
    deps.toast.error(
      !res.ok
        ? `Checkout service error (HTTP ${res.status}). Please try again.`
        : "Checkout returned an unexpected response. Please try again or contact support."
    );
    return { apiJson: {}, recoveredEarly: true };
  }
}

function finalizeRecoveredOrderId(
  deps: CheckoutOutcomeDeps,
  paymentMethod: "eway" | "cod",
  orderId: string
): void {
  if (paymentMethod === "cod") {
    deps.setPostSubmitNavigation("order_confirmation");
    try {
      deps.clearLocalCart();
      persistEmptyServerCart(deps.userId);
    } catch {
      /* ignore */
    }
    deps.toast.success("Order placed successfully.");
  } else {
    deps.setPostSubmitNavigation("order_confirmation");
  }
  goToOrderReview(orderId);
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
  setPostSubmitNavigation: (p: "secure_payment" | "order_confirmation") => void
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
  window.location.assign(redirectUrl);
  return true;
}

export function handleHostedRedirectJson(
  apiJson: Record<string, unknown>,
  setPostSubmitNavigation: (p: "secure_payment" | "order_confirmation") => void
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
  window.location.assign(payUrl);
  return true;
}

export function handleCodSuccessJson(
  apiJson: Record<string, unknown>,
  deps: CheckoutOutcomeDeps
): boolean {
  const outcomeType = apiJson.type;
  const isSuccessType = String(outcomeType || "").toLowerCase() === "success";
  const redirectFromApi = typeof apiJson.redirect === "string" ? apiJson.redirect.trim() : "";
  const orderNumberRaw = apiJson.order_number;
  const orderNumberPretty =
    typeof orderNumberRaw === "string" && orderNumberRaw.trim()
      ? orderNumberRaw.trim().replace(/^#/, "")
      : null;
  const orderIdForReview = orderNumberPretty ?? apiJson.orderId ?? apiJson.order_ref;
  const reviewPath =
    redirectFromApi ||
    (orderIdForReview != null && String(orderIdForReview).trim() !== ""
      ? `/order-review?order_id=${encodeURIComponent(String(orderIdForReview))}`
      : "");

  if (!isSuccessType || !reviewPath) return false;

  deps.setPostSubmitNavigation("order_confirmation");
  try {
    deps.clearLocalCart();
    persistEmptyServerCart(deps.userId);
  } catch {
    /* ignore */
  }
  deps.toast.success("Order placed successfully.");
  window.location.assign(reviewPath);
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
