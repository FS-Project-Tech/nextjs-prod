import "server-only";

import type { CartItem } from "@/lib/types/cart";
import type { CheckoutTotals } from "@/types/checkout";
import { runFullCartValidation } from "@/lib/cart/validate-cart-full";

const SUBTOTAL_EPSILON = 0.05;

export type ValidateCartForEwayResult =
  | { ok: true; validatedItems: CartItem[] }
  | {
      ok: false;
      valid: false;
      errors: Array<{ itemId: string; message: string }>;
      code?: "STOCK_OR_PRICE" | "SUBTOTAL_MISMATCH";
    };

/**
 * Server-only: same validation as POST /api/validate-cart, then ensures line subtotal matches
 * {@link validateAndRecalculateCheckout} so eWAY can charge the validated grand total safely.
 */
export async function validateCartForEwayCheckout(params: {
  cart_items: CartItem[];
  totals: CheckoutTotals;
}): Promise<ValidateCartForEwayResult> {
  const { cart_items, totals } = params;
  const result = await runFullCartValidation(cart_items);
  if (!result.valid) {
    return { ok: false, valid: false, errors: result.errors, code: "STOCK_OR_PRICE" };
  }

  const cartLineSum = result.items.reduce((sum, item) => {
    const unit = Number.parseFloat(String(item.price ?? "0")) || 0;
    const q = Number(item.qty) || 0;
    return sum + unit * q;
  }, 0);

  if (Math.abs(cartLineSum - totals.subtotal) > SUBTOTAL_EPSILON) {
    return {
      ok: false,
      valid: false,
      errors: [
        {
          itemId: "checkout",
          message: "Validated cart line total does not match checkout quote. Refresh and try again.",
        },
      ],
      code: "SUBTOTAL_MISMATCH",
    };
  }

  return { ok: true, validatedItems: result.items };
}
