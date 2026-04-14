import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders } from "@/lib/cors";
import { secureResponse } from "@/lib/security-headers";
import { emptyStoreCart } from "@/lib/store-cart-sync";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const requestId = getRequestId(req);
  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, withRequestId(res, requestId));
}

/**
 * POST /api/cart/clear
 * Empties the WooCommerce Store API session cart (DELETE /cart/items).
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { cart: after } = await emptyStoreCart(req);
    const n = Array.isArray(after.items) ? after.items.length : 0;
    if (process.env.NODE_ENV === "development") {
      console.log("[api/cart/clear] Woo cart cleared, line count:", n, after);
    }
    return applyCorsHeaders(
      req,
      withRequestId(secureResponse({ success: true, items: [], storeCart: after }), requestId)
    );
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/clear]", { requestId, error: e });
    }
    return applyCorsHeaders(
      req,
      createApiErrorResponse(e, {
        requestId,
        defaultMessage: "Clear cart failed",
        logPrefix: "api/cart/clear",
      })
    );
  }
}
