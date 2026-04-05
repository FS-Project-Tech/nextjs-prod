import wcAPI from "@/lib/woocommerce";
import type { CheckoutAddress } from "@/types/checkout";

export type WooLineItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
};

export type WooCreateOrderInput = {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  status: string;
  customer_id?: number;
  line_items: WooLineItem[];
  billing: CheckoutAddress;
  shipping: CheckoutAddress;
  shipping_line?: { method_id: string; method_title: string; total: string };
  coupon_code?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
};

export async function createWooOrder(input: WooCreateOrderInput): Promise<any> {
  const payload: Record<string, unknown> = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    ...(input.customer_id && input.customer_id > 0 ? { customer_id: input.customer_id } : {}),
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
    meta_data: input.meta_data || [],
  };
  if (input.shipping_line) {
    payload.shipping_lines = [input.shipping_line];
  }
  if (input.coupon_code?.trim()) {
    payload.coupon_lines = [{ code: input.coupon_code.trim() }];
  }
  const res = await wcAPI.post("/orders", payload);
  return res.data;
}

export async function updateWooOrder(
  orderId: number,
  patch: Record<string, unknown>
): Promise<any> {
  const res = await wcAPI.put(`/orders/${orderId}`, patch);
  return res.data;
}

/** Private order note (not visible to customer on emails unless customer_note is true). */
export async function addWooOrderNote(
  orderId: number,
  note: string,
  options?: { customer_note?: boolean }
): Promise<void> {
  await wcAPI.post(`/orders/${orderId}/notes`, {
    note,
    customer_note: options?.customer_note ?? false,
  });
}
