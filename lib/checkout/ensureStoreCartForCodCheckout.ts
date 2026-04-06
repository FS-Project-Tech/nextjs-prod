import "server-only";

import type { NextRequest } from "next/server";
import { syncCartViaStoreApiWithSession, type StoreCartJson } from "@/lib/store-cart-sync";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import { resolveWooLineItems } from "@/lib/woo/resolveLineItems";
import type { CartItem } from "@/lib/types/cart";
import type { CheckoutInitiatePayload } from "@/types/checkout";

export type EnsureStoreCartResult =
  | { ok: true; storeNonce: string; rawCart: StoreCartJson }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Aligns Woo Store API session cart with checkout `line_items` using the same {@link NextRequest}
 * as `POST /api/checkout/create-order` (cookies + X-WC-Session). Fixes empty-cart errors when a
 * separate browser call to `POST /api/cart` used a different session or never ran.
 */
export async function ensureStoreCartForCodCheckout(
  req: NextRequest,
  payload: CheckoutInitiatePayload,
): Promise<EnsureStoreCartResult> {
  const resolved = await resolveWooLineItems(
    payload.line_items.map((li) => ({
      sku: li.sku,
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    })),
  );

  if (resolved.ok === false) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Some items in your cart are no longer available. Please review your cart.",
        code: "CART_ITEMS_UNAVAILABLE",
        missingItems: resolved.unavailableItems.map((it) => ({
          product_id: it.product_id,
          variation_id: it.variation_id,
        })),
      },
    };
  }

  const items: CartItem[] = resolved.line_items.map((li) => {
    const hasVar = li.variation_id != null && li.variation_id > 0;
    return {
      id: hasVar ? `${li.product_id}:${li.variation_id}` : String(li.product_id),
      productId: li.product_id,
      variationId: hasVar ? li.variation_id : undefined,
      name: `Product ${li.product_id}`,
      slug: "",
      qty: li.quantity,
      price: "0",
    };
  });

  const stockCheck = await validateCartLineStock(items);
  if (!stockCheck.valid) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Cart validation failed",
        errors: stockCheck.errors,
      },
    };
  }

  try {
    const session = await syncCartViaStoreApiWithSession(req, items, payload.coupon_code);
    return { ok: true, storeNonce: session.nonce, rawCart: session.rawCart };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not sync cart with WooCommerce.";
    return {
      ok: false,
      status: 500,
      body: { success: false, error: msg },
    };
  }
}
