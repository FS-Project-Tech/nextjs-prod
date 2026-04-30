import "server-only";

import type { CheckoutInitiatePayload } from "@/types/checkout";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { runFullCartValidation } from "@/lib/cart/validate-cart-full";
import {
  validateCartForEwayCheckout,
  type ValidateCartForEwayResult,
} from "@/lib/checkout/validateCartForEwayCheckout";

export type CheckoutPricingCallOptions = {
  requestId?: string;
  currency: string;
  customerType: string;
};

type PricingResult = Awaited<ReturnType<typeof validateAndRecalculateCheckout>>;

export type PricingWithEwayCartGateResult =
  | { ok: true; pricing: PricingResult }
  | { ok: false; cartCheck: Extract<ValidateCartForEwayResult, { ok: false }> };

/**
 * Runs checkout pricing (Woo-backed) and, for eWAY, full cart validation + subtotal gate in parallel
 * where possible — shared by `/api/checkout` and `/api/checkout/create-session`.
 */
export async function pricingWithEwayCartGate(
  payload: CheckoutInitiatePayload,
  options: CheckoutPricingCallOptions,
): Promise<PricingWithEwayCartGateResult> {
  const isEway = payload.payment_method === "eway";
  const [pricing, parallelCartValidation] = await Promise.all([
    validateAndRecalculateCheckout(payload, {
      requestId: options.requestId,
      currency: options.currency,
      customerType: options.customerType,
    }),
    isEway ? runFullCartValidation(payload.cart_items ?? []) : Promise.resolve(null),
  ]);

  if (!isEway) {
    return { ok: true, pricing };
  }

  const cartCheck = await validateCartForEwayCheckout({
    cart_items: payload.cart_items ?? [],
    totals: pricing.totals,
    validationResult: parallelCartValidation ?? undefined,
  });

  if (cartCheck.ok === false) {
    return { ok: false, cartCheck };
  }
  return { ok: true, pricing };
}
