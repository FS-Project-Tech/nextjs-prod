/**
 * Maps WooCommerce gateway IDs to customer-facing labels.
 * Always send `payment_method: "cod"` to Woo — never `on_account`.
 */

export type PaymentMethodLike = {
  id?: string;
  title?: string;
};

export function getPaymentMethodOptionLabel(method: PaymentMethodLike): string {
  const id = String(method?.id ?? "").toLowerCase();
  if (id === "cod") return "On Account";
  const t = method?.title?.trim();
  if (t) return t;
  return id ? id.replace(/_/g, " ") : "—";
}

export type OrderPaymentFields = {
  payment_method?: string;
  payment_method_title?: string;
};

/**
 * Receipt / order summary: show "On Account" for COD regardless of Woo title
 * (e.g. "Cash on delivery").
 */
export function getOrderPaymentMethodDisplay(order: OrderPaymentFields): string {
  const pm = String(order.payment_method ?? "").toLowerCase();
  if (pm === "cod") return "On Account";

  const title = order.payment_method_title?.trim() ?? "";
  if (title) {
    const lower = title.toLowerCase();
    if (
      lower.includes("cash on delivery") ||
      lower.includes("cash on deliver") ||
      lower === "cod"
    ) {
      return "On Account";
    }
    return title;
  }

  if (pm) return pm.replace(/_/g, " ");
  return "—";
}
