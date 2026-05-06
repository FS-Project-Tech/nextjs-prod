/**
 * Cart Types
 * Shared type definitions for cart-related functionality
 */

import type { ImageData } from "./common";

/**
 * Delivery plan options
 */
export type DeliveryPlan = "none" | "7" | "14" | "30";

/**
 * Cart item interface
 */
export interface CartItem {
  id: string; // productId or productId:variationId
  productId: number;
  variationId?: number;
  name: string;
  slug: string;
  imageUrl?: string;
  price: string; // display price string
  qty: number;
  sku?: string | null;
  attributes?: Record<string, string>;
  /** Woo Store API `cart_item_data` (e.g. bulk_uom) for quantity-units plugins. */
  cartItemData?: Record<string, string | number>;
  deliveryPlan?: DeliveryPlan;
  /** WooCommerce tax class slug or name, e.g. 'gst-10', 'gst-free' */
  tax_class?: string;
  /** WooCommerce tax status, e.g. 'taxable', 'none' */
  tax_status?: string;
  /** WooCommerce Store API cart line key (required for DELETE /cart/items/:key) */
  wc_store_item_key?: string;
  /** Tag-based campaign line discount (Empower 10%). */
  empowerEligible?: boolean;
}

/**
 * Cart totals
 */
export interface CartTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  gst: number;
  total: number;
}

/**
 * Cart validation result
 */
export interface CartValidationResult {
  valid: boolean;
  errors: Array<{
    itemId: string;
    field: string;
    message: string;
  }>;
}

/**
 * Cart sync result
 */
export interface CartSyncResult {
  items: CartItem[];
  totals: CartTotals;
  validated: boolean;
}
