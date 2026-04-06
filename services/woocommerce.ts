import type { AxiosRequestConfig } from "axios";
import wcAPI from "@/lib/woocommerce";
import type { CheckoutAddress } from "@/types/checkout";

export type WooLineItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
};

export type WooFeeLineInput = {
  name: string;
  total: string;
  tax_status: "taxable" | "none";
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
  fee_lines?: WooFeeLineInput[];
  coupon_code?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
};

/** Phase-1 POST: smallest body so Woo can persist the order quickly. */
export type WooMinimalOrderInput = Pick<
  WooCreateOrderInput,
  | "payment_method"
  | "payment_method_title"
  | "set_paid"
  | "status"
  | "line_items"
  | "billing"
  | "shipping"
  | "customer_id"
>;

/**
 * Single axios config object per request (timeout + optional AbortSignal).
 * Do not pass multiple disjoint config blobs to axios.post.
 */
export function buildWooOrderWriteConfig(opts?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): AxiosRequestConfig {
  const config: AxiosRequestConfig = {};
  if (opts?.timeoutMs != null && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) {
    config.timeout = opts.timeoutMs;
  }
  if (opts?.signal) {
    config.signal = opts.signal;
  }
  return config;
}

/**
 * Phase-1 POST /orders — minimal body only.
 * Axios: exactly one config object — `wcAPI.post(url, data, { timeout?, signal? })`.
 */
export async function createWooOrderMinimal(
  input: WooMinimalOrderInput,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<unknown> {
  const payload: Record<string, unknown> = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    ...(input.customer_id && input.customer_id > 0 ? { customer_id: input.customer_id } : {}),
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
  };

  const config = buildWooOrderWriteConfig(opts);
  const res = await wcAPI.post("/orders", payload, config);
  return res.data;
}

/** Full single-shot create (legacy / tooling). Prefer {@link createWooOrderMinimal} + PUT for checkout. */
export async function createWooOrder(
  input: WooCreateOrderInput,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<unknown> {
  const payload: Record<string, unknown> = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    ...(input.customer_id && input.customer_id > 0 ? { customer_id: input.customer_id } : {}),
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
  };
  if (input.meta_data && input.meta_data.length > 0) {
    payload.meta_data = input.meta_data;
  }
  if (input.shipping_line) {
    payload.shipping_lines = [input.shipping_line];
  }
  if (input.fee_lines && input.fee_lines.length > 0) {
    payload.fee_lines = input.fee_lines;
  }
  if (input.coupon_code?.trim()) {
    payload.coupon_lines = [{ code: input.coupon_code.trim() }];
  }

  const config = buildWooOrderWriteConfig(opts);
  const res = await wcAPI.post("/orders", payload, config);
  return res.data;
}

export async function updateWooOrder(
  orderId: number,
  patch: Record<string, unknown>,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<unknown> {
  const config = buildWooOrderWriteConfig(opts);
  const res = await wcAPI.put(`/orders/${orderId}`, patch, config);
  return res.data;
}

/** Alias for phase-2 / deferred patches (same as {@link updateWooOrder}). */
export const updateWooOrderAsync = updateWooOrder;

/** Private order note (not visible to customer on emails unless customer_note is true). */
export async function addWooOrderNote(
  orderId: number,
  note: string,
  options?: { customer_note?: boolean },
): Promise<void> {
  await wcAPI.post(`/orders/${orderId}/notes`, {
    note,
    customer_note: options?.customer_note ?? false,
  });
}
