/** Animated status lines shown in the checkout placing overlay (all payment methods). */

const SHARED_PREFIX = [
  "🔒 Securing your checkout session...",
  "🛒 Gathering your order information...",
  "📦 Confirming product availability...",
  "🚚 Preparing delivery options...",
] as const;

const TAIL_EWAY = [
  "💳 Connecting securely to payment gateway...",
  "🏦 Verifying payment authorization...",
  "✅ Finalizing your secure order...",
  "🎉 Redirecting you to secure payment...",
] as const;

const TAIL_AFTERPAY = [
  "💳 Connecting securely to Afterpay...",
  "🏦 Verifying payment authorization...",
  "✅ Finalizing your secure order...",
  "🎉 Redirecting you to Afterpay...",
] as const;

const TAIL_COD = [
  "📋 Validating your on-account order...",
  "✅ Finalizing your secure order...",
  "🎉 Redirecting to order confirmation...",
] as const;

export type CheckoutPlacingPaymentMethod = "eway" | "cod" | "afterpay";

export function getCheckoutPlacingMessages(
  paymentMethod: CheckoutPlacingPaymentMethod
): readonly string[] {
  switch (paymentMethod) {
    case "cod":
      return [...SHARED_PREFIX, ...TAIL_COD];
    case "afterpay":
      return [...SHARED_PREFIX, ...TAIL_AFTERPAY];
    default:
      return [...SHARED_PREFIX, ...TAIL_EWAY];
  }
}

/** Milliseconds between animated status lines. */
export const CHECKOUT_PLACING_MESSAGE_INTERVAL_MS = 2200;
