/** Woo order meta: idempotent headless checkout session (UUID). */
export const HEADLESS_CHECKOUT_SESSION_META_KEY = "_headless_checkout_session_id";

/** Browser sessionStorage key for the same UUID sent on each checkout POST. */
export const HEADLESS_CHECKOUT_SESSION_STORAGE_KEY = "h_headless_checkout_session_v1";

/** Woo order meta: set when eWAY hosted payment is started; used with {@link HEADLESS_EWAY_PAYMENT_URL_META_KEY}. */
export const HEADLESS_PAYMENT_INITIATED_META_KEY = "payment_initiated";

/** Woo order meta: eWAY SharedPaymentUrl — enables idempotent resume / duplicate-submit safety. */
export const HEADLESS_EWAY_PAYMENT_URL_META_KEY = "payment_url";

/**
 * Woo order meta: `order.total` (major units string) at the time the hosted payment URL was issued.
 * Reuse {@link HEADLESS_EWAY_PAYMENT_URL_META_KEY} only when this still matches live `order.total`.
 */
export const HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY = "headless_eway_order_total";

/**
 * Woo order meta: server-validated grand total (Zustand cart → validate-cart rules + shipping/GST quote).
 * eWAY charges this amount, not a recomputed Woo session/cart total that may drift.
 */
export const HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY = "headless_validated_checkout_total";

/** Woo order meta: readable checkout session UUID (same value as {@link HEADLESS_CHECKOUT_SESSION_META_KEY}). */
export const CHECKOUT_SESSION_ID_ORDER_META_KEY = "checkout_session_id";
