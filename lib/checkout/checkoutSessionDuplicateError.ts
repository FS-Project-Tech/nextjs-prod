/**
 * Thrown when checkout would create a second Woo order for the same headless session
 * (e.g. duplicate submit after the first order left `pending` for `processing`).
 */
export class CheckoutSessionOrderExistsError extends Error {
  readonly code = "CHECKOUT_SESSION_ORDER_EXISTS" as const;

  constructor(
    readonly orderIdRaw: string | number | bigint,
    readonly orderKey: string,
    readonly wooOrderTotal: string | null,
    readonly paymentMethod: string,
  ) {
    super("An order for this checkout session was already submitted.");
    this.name = "CheckoutSessionOrderExistsError";
  }
}
