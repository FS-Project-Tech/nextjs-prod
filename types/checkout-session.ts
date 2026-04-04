import type {
  CheckoutAddress,
  CheckoutCartItem,
  CheckoutInitiatePayload,
  CheckoutTotals,
  PaymentMethod,
} from "@/types/checkout";

/**
 * Persisted checkout session for token-based headless → Woo handoff.
 * No PCI data: only addresses, line items, shipping choice, and server-validated totals.
 */
export type CheckoutSessionRecord = {
  token: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
  /** WordPress / Woo customer id when logged in on Next (optional) */
  userId: number | null;
  /** Optional client idempotency key → same redirect if replayed within TTL */
  idempotencyKey?: string;
  payment_method: PaymentMethod;
  payload: CheckoutInitiatePayload;
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  shippingLine: { method_id: string; method_title: string; total: string };
  totals: CheckoutTotals;
};

/**
 * Payload returned to WooCommerce over the authenticated get-session API.
 */
export type CheckoutSessionPublic = {
  billing: CheckoutAddress;
  shipping: CheckoutAddress;
  line_items: CheckoutCartItem[];
  shipping_method_id: string;
  shipping_line: CheckoutSessionRecord["shippingLine"];
  payment_method: PaymentMethod;
  coupon_code?: string;
  insurance_option?: "yes" | "no";
  ndis_type?: string;
  totals: CheckoutTotals;
  user_id: number | null;
  meta_data: Array<{ key: string; value: string }>;
};
