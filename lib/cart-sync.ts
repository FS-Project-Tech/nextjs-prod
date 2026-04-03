/**
 * Cart Sync with WooCommerce
 * Real-time synchronization of cart data between Next.js and WooCommerce
 */

import wcAPI from "@/lib/woocommerce";
import type { CartItem } from "@/lib/types/cart";

export interface WooCommerceCartItem {
  id: string;
  product_id: number;
  variation_id?: number;
  quantity: number;
  name: string;
  price: string;
  sku?: string;
  image?: { src: string; alt: string };
  stock_status?: string;
  stock_quantity?: number | null;
}

export interface WooCommerceCartData {
  items: WooCommerceCartItem[];
  subtotal: string;
  total: string;
  tax_total: string;
  shipping_total: string;
  discount_total: string;
  coupon_lines?: Array<{ code: string; discount: string }>;
}

/**
 * Sync cart items to WooCommerce and get validated prices/totals
 * This ensures cart data matches WooCommerce backend exactly
 */
export async function syncCartToWooCommerce(
  items: CartItem[],
  couponCode?: string
): Promise<WooCommerceCartData | null> {
  try {
    const lineItems = items.map((item) => ({
      product_id: item.productId,
      variation_id: item.variationId || undefined,
      quantity: item.qty,
    }));

    const orderData: Record<string, unknown> = {
      line_items: lineItems,
      ...(couponCode ? { coupon_lines: [{ code: couponCode }] } : {}),
      set_paid: false,
    };

    const response = await wcAPI.post("/orders", orderData);
    const order = response.data as {
      id: number;
      line_items?: Array<{
        product_id: number;
        variation_id?: number;
        quantity: number;
        name: string;
        price: string;
        subtotal?: string;
        sku?: string;
        image?: { src: string; alt: string };
        stock_status?: string;
        stock_quantity?: number | null;
      }>;
      total_line_items_price?: string;
      /** Some WC versions expose cart subtotal here instead of total_line_items_price */
      subtotal?: string;
      total?: string;
      total_tax?: string;
      total_shipping?: string;
      total_discount?: string;
      coupon_lines?: Array<{ code: string; discount: string }>;
    };

    const fullLineItems = Array.isArray(order.line_items) ? order.line_items : [];
    console.info("[woo-sync] order response line_items", {
      orderId: order.id,
      line_items: fullLineItems.map((li) => ({
        product_id: Number(li.product_id || 0),
        variation_id:
          li.variation_id != null ? Number(li.variation_id || 0) : null,
        name: li.name || "",
        quantity: Number(li.quantity || 0),
        subtotal: String(li.subtotal ?? ""),
      })),
    });

    const zeroMapped = fullLineItems.some((li) => Number(li.product_id || 0) <= 0);
    if (zeroMapped) {
      console.error("[woo-sync] invalid product mapping in Woo order response", {
        orderId: order.id,
        warning:
          "Possible plugin modifying REST order (woocommerce_rest_pre_insert_shop_order_object).",
        raw_line_items: fullLineItems,
      });
      throw new Error(
        "Invalid product mapping from WooCommerce. Likely product type or plugin issue."
      );
    }

    const lineList = order.line_items || [];
    const subtotalFromApi =
      parseFloat(order.total_line_items_price || order.subtotal || "") || 0;
    const subtotalFromLines = lineList.reduce((sum, item) => {
      const lineSub = item.subtotal != null ? parseFloat(String(item.subtotal)) : NaN;
      if (Number.isFinite(lineSub) && lineSub > 0) {
        return sum + lineSub;
      }
      const unit = parseFloat(String(item.price || "0")) || 0;
      return sum + unit * (item.quantity || 0);
    }, 0);
    const resolvedSubtotal =
      subtotalFromApi > 0 ? subtotalFromApi : subtotalFromLines;

    const cartData: WooCommerceCartData = {
      items: lineList.map((item) => ({
        id: `${item.product_id}${item.variation_id ? ":" + item.variation_id : ""}`,
        product_id: item.product_id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        name: item.name,
        price: item.price,
        sku: item.sku,
        image: item.image,
        stock_status: item.stock_status,
        stock_quantity: item.stock_quantity,
      })),
      subtotal: String(resolvedSubtotal),
      total: order.total || "0",
      tax_total: order.total_tax || "0",
      shipping_total: order.total_shipping || "0",
      discount_total: order.total_discount || "0",
      coupon_lines: order.coupon_lines || [],
    };

    try {
      await wcAPI.delete(`/orders/${order.id}`, { params: { force: true } });
    } catch (deleteError) {
      console.warn("Failed to delete draft order:", deleteError);
    }

    return cartData;
  } catch (error) {
    console.error("Cart sync error:", error);

    const err = error as { response?: { data?: { message?: string; code?: string } } };
    if (err?.response?.data) {
      const respData = err.response.data;
      throw new Error(
        respData.message || respData.code || "Cart sync failed"
      );
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Validate cart item availability and stock
 */
export async function validateCartItems(
  items: CartItem[]
): Promise<{ valid: boolean; errors: Array<{ itemId: string; message: string }> }> {
  const errors: Array<{ itemId: string; message: string }> = [];

  try {
    for (const item of items) {
      try {
        const endpoint = item.variationId
          ? `/products/${item.productId}/variations/${item.variationId}`
          : `/products/${item.productId}`;

        const response = await wcAPI.get(endpoint);
        const product = response.data as {
          stock_status?: string;
          manage_stock?: boolean;
          stock_quantity?: number | null;
          backorders_allowed?: boolean;
        };

        if (product.stock_status === "outofstock") {
          errors.push({
            itemId: item.id,
            message: `${item.name} is out of stock`,
          });
        } else if (product.manage_stock && product.stock_quantity != null) {
          if (product.stock_quantity < item.qty) {
            const available = product.backorders_allowed
              ? `${item.name} (only ${product.stock_quantity} available, backorders allowed)`
              : `${item.name} (only ${product.stock_quantity} available)`;
            errors.push({
              itemId: item.id,
              message: available,
            });
          }
        }
      } catch {
        errors.push({
          itemId: item.id,
          message: `Unable to validate ${item.name}`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error("Cart validation error:", error);
    return {
      valid: false,
      errors: [{ itemId: "unknown", message: "Validation failed" }],
    };
  }
}

/**
 * Update cart item prices from WooCommerce
 */
export async function updateCartPrices(
  items: CartItem[]
): Promise<Map<string, string>> {
  const priceMap = new Map<string, string>();

  try {
    await Promise.all(
      items.map(async (item) => {
        try {
          const endpoint = item.variationId
            ? `/products/${item.productId}/variations/${item.variationId}`
            : `/products/${item.productId}`;

          const response = await wcAPI.get(endpoint, {
            params: { _fields: "id,price,regular_price,sale_price,on_sale" },
          });
          const product = response.data as {
            price?: string;
            regular_price?: string;
            sale_price?: string;
            on_sale?: boolean;
          };

          const price =
            product.on_sale && product.sale_price
              ? product.sale_price
              : product.price || product.regular_price || item.price;

          priceMap.set(item.id, price ?? item.price);
        } catch {
          priceMap.set(item.id, item.price);
        }
      })
    );
  } catch (error) {
    console.error("Price update error:", error);
  }

  return priceMap;
}
