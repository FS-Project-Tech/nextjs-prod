/**
 * WooCommerce API Types
 * Types for WooCommerce REST API responses used in API routes
 */

// =============================================================================
// Generic Response Types
// =============================================================================

export interface WCApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface WCErrorResponse {
  code: string;
  message: string;
  data?: {
    status: number;
    params?: Record<string, string>;
  };
}

// =============================================================================
// Customer Types
// =============================================================================

export interface WCCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  billing: WCAddress;
  shipping: WCAddress;
  avatar_url?: string;
  date_created?: string;
  date_modified?: string;
  role?: string;
}

export interface WCAddress {
  first_name: string;
  last_name: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

// =============================================================================
// Order Types
// =============================================================================

export interface WCOrder {
  id: number;
  parent_id: number;
  status: string;
  currency: string;
  total: string;
  total_tax: string;
  subtotal?: string;
  discount_total: string;
  shipping_total: string;
  date_created: string;
  date_modified: string;
  customer_id: number;
  billing: WCAddress;
  shipping: WCAddress;
  payment_method: string;
  payment_method_title: string;
  transaction_id?: string;
  line_items: WCLineItem[];
  shipping_lines?: WCShippingLine[];
  coupon_lines?: WCCouponLine[];
  customer_note?: string;
  meta_data?: WCMetaData[];
}

export interface WCLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  tax_class: string;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  sku: string;
  price: number;
  image?: {
    id: number;
    src: string;
  };
  meta_data?: WCMetaData[];
}

export interface WCShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  total: string;
  total_tax: string;
  meta_data?: WCMetaData[];
}

export interface WCCouponLine {
  id: number;
  code: string;
  discount: string;
  discount_tax: string;
  meta_data?: WCMetaData[];
}

export interface WCMetaData {
  id?: number;
  key: string;
  value: string | number | boolean | Record<string, unknown>;
}

// =============================================================================
// Coupon Types
// =============================================================================

export interface WCCoupon {
  id: number;
  code: string;
  amount: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  description: string;
  date_expires?: string | null;
  usage_count: number;
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  individual_use: boolean;
  product_ids: number[];
  excluded_product_ids: number[];
  minimum_amount?: string;
  maximum_amount?: string;
  email_restrictions?: string[];
  free_shipping: boolean;
  meta_data?: WCMetaData[];
}

// =============================================================================
// Payment Gateway Types
// =============================================================================

export interface WCPaymentGateway {
  id: string;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  method_title: string;
  method_description: string;
  settings: Record<string, WCGatewaySetting>;
}

export interface WCGatewaySetting {
  id: string;
  label: string;
  description: string;
  type: string;
  value: string;
  default: string;
}

// =============================================================================
// Shipping Types
// =============================================================================

export interface WCShippingZone {
  id: number;
  name: string;
  order: number;
}

export interface WCShippingMethod {
  id: string;
  title: string;
  description: string;
  cost?: string;
  tax_status?: string;
  settings?: Record<string, WCGatewaySetting>;
}

// =============================================================================
// Cart Types (Store API)
// =============================================================================

export interface WCCartItem {
  key: string;
  id: number;
  quantity: number;
  name: string;
  sku: string;
  price: number;
  line_price: number;
  line_subtotal: number;
  line_total: number;
  images: Array<{ id: number; src: string; thumbnail: string; alt: string }>;
  variation?: Array<{ attribute: string; value: string }>;
  product_id: number;
  variation_id?: number;
}

export interface WCCart {
  items: WCCartItem[];
  totals: {
    subtotal: string;
    subtotal_tax: string;
    total: string;
    total_tax: string;
    total_shipping: string;
    total_discount: string;
  };
  coupons: Array<{ code: string; discount: string }>;
  shipping_rates?: Array<{
    package_id: number;
    name: string;
    destination: WCAddress;
    items: Array<{ key: string; name: string; quantity: number }>;
    shipping_rates: WCShippingMethod[];
  }>;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract error message from WooCommerce error response
 */
export function getWCErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    if ("response" in error) {
      const response = error as { response?: { data?: WCErrorResponse } };
      if (response.response?.data?.message) {
        return response.response.data.message;
      }
    }
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return "An unexpected error occurred";
}

/**
 * Type guard for WooCommerce error response
 */
export function isWCError(response: unknown): response is WCErrorResponse {
  return (
    typeof response === "object" && response !== null && "code" in response && "message" in response
  );
}
