import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders } from "@/lib/cors";
import { secureResponse } from "@/lib/security-headers";
import { emptyStoreCart } from "@/lib/store-cart-sync";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, res);
}

/**
 * POST /api/cart/clear
 * Empties the WooCommerce Store API session cart (DELETE /cart/items).
 */
export async function POST(req: NextRequest) {
  try {
    const { cart: after } = await emptyStoreCart(req);
    const n = Array.isArray(after.items) ? after.items.length : 0;
    if (process.env.NODE_ENV === "development") {
      console.log("[api/cart/clear] Woo cart cleared, line count:", n, after);
    }
    return applyCorsHeaders(req, secureResponse({ success: true, items: [], storeCart: after }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Clear cart failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/clear]", e);
    }
    return applyCorsHeaders(req, secureResponse({ error: message }, { status: 500 }));
  }
}
