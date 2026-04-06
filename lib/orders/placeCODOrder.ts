/**
 * Place a WooCommerce COD order (`payment_method: cod`) via `/api/create-order`; shoppers see “On Account” in UI.
 *
 * @example
 * ```ts
 * await placeCODOrder({
 *   billing: { first_name: "Sam", last_name: "Lee", email: "sam@example.com", address_1: "1 Main St", city: "Sydney", postcode: "2000", country: "AU" },
 *   line_items: [{ product_id: 123, quantity: 2 }],
 *   shipping_lines: [{ method_id: "flat_rate", method_title: "Flat rate", total: "12.50" }],
 * });
 * ```
 */
export type CODBillingAddress = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
};

export type CODLineItem = {
  product_id: number;
  quantity: number;
  variation_id?: number;
};

export type CODShippingLine = {
  method_id: string;
  method_title: string;
  total: string;
};

export type PlaceCODOrderPayload = {
  billing: CODBillingAddress;
  /** If omitted, the API uses billing for shipping. */
  shipping?: CODBillingAddress;
  line_items: CODLineItem[];
  shipping_lines?: CODShippingLine[];
  coupon_lines?: { code: string }[];
  customer_note?: string;
  customer_id?: number;
  payment_method_title?: string;
};

export type PlaceCODOrderResult = {
  id: number;
  order_key?: string;
};

type ApiSuccess = {
  success: true;
  id: number;
  order_key?: string;
};

type ApiError = {
  success?: false;
  error?: string;
};

/**
 * POSTs a COD order and performs a full-page redirect on success.
 * @param successUrl - Where to send the browser after Woo confirms the order (default: `/order-success?orderId=…`).
 */
export async function placeCODOrder(
  payload: PlaceCODOrderPayload,
  successUrl?: (order: PlaceCODOrderResult) => string
): Promise<PlaceCODOrderResult> {
  const res = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as ApiSuccess | ApiError;

  if (!res.ok || !data || (data as ApiSuccess).success !== true) {
    const message =
      typeof (data as ApiError).error === "string" && (data as ApiError).error
        ? (data as ApiError).error
        : `Order failed (${res.status})`;
    throw new Error(message);
  }

  const ok = data as ApiSuccess;
  const result: PlaceCODOrderResult = { id: ok.id, order_key: ok.order_key };

  const target =
    successUrl?.(result) ?? `/order-success?orderId=${encodeURIComponent(String(ok.id))}`;

  if (typeof window !== "undefined") {
    window.location.assign(target);
  }

  return result;
}
