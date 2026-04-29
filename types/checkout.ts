import type { CartItem } from "@/lib/types/cart";

/** Woo REST `payment_method` for headless checkout. */
export type PaymentMethod = "eway" | "cod" | "afterpay";

/** Submit CTA + overlay: cart validation vs payment API / redirect. */
export type CheckoutPlacingPhase = "idle" | "validating" | "payment";

export type CheckoutCartItem = {
  /** Resolved from SKU server-side when possible; optional if `sku` is sent. */
  product_id?: number;
  variation_id?: number;
  quantity: number;
  /** Preferred for resolution — mapped to Woo `product_id` / `variation_id` before order creation. */
  sku?: string;
  /**
   * Display unit price from the storefront cart (e.g. after quantity-unit / packaging multipliers).
   * When set, checkout quote and order line math use this instead of raw Woo REST `price` alone.
   */
  unit_price?: number;
  /** Set by token redeem when headless locked line amounts (no cart coupon). */
  subtotal?: string;
  total?: string;
};

export type CheckoutAddress = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
};

export type CheckoutResumePayload = {
  order_id: number;
  order_key: string;
};

export type CheckoutInitiatePayload = {
  billing: CheckoutAddress;
  shipping: CheckoutAddress;
  line_items: CheckoutCartItem[];
  /**
   * Required when `payment_method === "eway"`: current Zustand cart lines; server re-validates (same as /api/validate-cart)
   * before charging eWAY. Never trust this for amounts without {@link runFullCartValidation}.
   */
  cart_items?: CartItem[];
  shipping_method_id: string;
  payment_method: PaymentMethod;
  /** Client-generated UUID for idempotent checkout (stored on Woo order meta). */
  checkout_session_id?: string;
  /** Guest (or client): resume a specific pending order after a prior create response. */
  checkout_resume?: CheckoutResumePayload;
  /** Woo Store API checkout field; optional on REST payloads. */
  payment_data?: unknown[];
  coupon_code?: string;
  insurance_option?: "yes" | "no";
  ndis_type?: string;
  /** Aggregated NDIS details for order meta (JSON string). */
  ndis_info?: string;
  /** Aggregated HCP details for order meta (JSON string). */
  hcp_info?: string;
  delivery_authority?: string;
  no_paperwork?: boolean;
  discreet_packaging?: boolean;
  newsletter?: boolean;
  delivery_notes?: string;
  /** Campaign tracking: true when at least one Empower line discount was applied. */
  empower_program_applied?: boolean;
  /** Campaign tracking: total Empower discount (major units). */
  empower_discount_total?: number;
  /** Campaign tracking: summed quantity of Empower-discounted lines. */
  empower_discount_items?: number;
};

export type CheckoutActor = {
  authenticated: boolean;
  userId?: number;
  email?: string;
  role?: string;
  roles: string[];
  ndisApproved: boolean;
};

export type CheckoutTotals = {
  subtotal: number;
  shipping: number;
  discount: number;
  gst: number;
  total: number;
  totalCents: number;
};

/** Woo REST order `shipping_lines[]` — include `instance_id` when known so WC applies correct shipping tax rules. */
export type CheckoutWooShippingLine = {
  method_id: string;
  method_title: string;
  total: string;
  instance_id?: string;
};

export type PendingEwayOrder = {
  orderRef: string;
  createdAt: number;
  payload: CheckoutInitiatePayload;
  line_items: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  shipping_line: CheckoutWooShippingLine;
  totals: CheckoutTotals;
  actor: CheckoutActor;
};

export type CheckoutErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "PAYMENT_FAILED"
  | "SERVER_ERROR"
  | "NOT_FOUND"
  | "CONFLICT";
