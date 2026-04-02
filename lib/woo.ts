import wcAPI from "@/lib/woocommerce";
import type { CartItem, WooOrder } from "@/types";

export type WooShippingLine = {
  method_id: string;
  method_title?: string;
  total: string;
};

export type WooCreateOrderPayload = {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  status: string;
  billing: Record<string, string>;
  shipping?: Record<string, string>;
  line_items: Array<{
    product_id: number;
    variation_id?: number;
    quantity: number;
  }>;
  shipping_lines?: WooShippingLine[];
  coupon_code?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
};

function mapToWooLineItems(items: CartItem[]) {
  return items.map((li) => ({
    product_id: li.product_id,
    variation_id: li.variation_id,
    quantity: li.quantity,
  }));
}

export async function getProducts(productIds: number[]): Promise<any[]> {
  const ids = [...new Set(productIds)].filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return [];

  const products = await Promise.all(
    ids.map(async (id) => {
      const res = await wcAPI.get(`/products/${id}`);
      return res.data;
    })
  );
  return products;
}

export async function createOrder(payload: WooCreateOrderPayload): Promise<WooOrder> {
  const data: Record<string, unknown> = {
    payment_method: payload.payment_method,
    payment_method_title: payload.payment_method_title,
    set_paid: payload.set_paid,
    status: payload.status,
    billing: payload.billing,
    shipping: payload.shipping,
    line_items: payload.line_items,
    shipping_lines: payload.shipping_lines,
    meta_data: payload.meta_data,
  };

  // Woo expects coupon lines in `coupon_lines`.
  if (payload.coupon_code) {
    data.coupon_lines = [{ code: payload.coupon_code }];
  }

  const response = await wcAPI.post("/orders", data);
  return response.data as WooOrder;
}

export async function updateOrder(
  orderId: number,
  patch: Partial<Pick<WooCreateOrderPayload, "set_paid" | "status" | "payment_method">> &
    Record<string, unknown>
): Promise<WooOrder> {
  const response = await wcAPI.put(`/orders/${orderId}`, patch);
  return response.data as WooOrder;
}

export function buildWooLineItems(items: CartItem[]) {
  return mapToWooLineItems(items);
}

