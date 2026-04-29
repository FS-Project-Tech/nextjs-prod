import type { CheckoutInitiatePayload } from "@/types/checkout";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";

/**
 * Validates the same JSON shape as `/api/checkout`, but requires `payment_method: "afterpay"` and `cart_items`
 * by reusing the strict parser with a temporary `eway` shim (same cart_items rules as card checkout).
 */
export function parseAfterpayCheckoutBody(input: unknown): CheckoutInitiatePayload {
  if (typeof input !== "object" || input === null) {
    throw new Error("Invalid checkout payload.");
  }
  const raw = { ...(input as Record<string, unknown>) };
  const pm = String(raw.payment_method ?? "").trim().toLowerCase();
  if (pm !== "afterpay") {
    throw new Error('payment_method must be "afterpay".');
  }
  if (!raw.cart_items || !Array.isArray(raw.cart_items) || raw.cart_items.length === 0) {
    throw new Error("cart_items is required for Afterpay checkout.");
  }

  raw.payment_method = "eway";
  const parsed = parseCheckoutPayload(raw);

  return {
    ...parsed,
    payment_method: "afterpay",
  };
}
