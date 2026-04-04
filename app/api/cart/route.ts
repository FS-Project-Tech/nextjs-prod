import { NextRequest, NextResponse } from "next/server";
import { syncCartViaStoreApi } from "@/lib/store-cart-sync";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import type { CartItem } from "@/lib/types/cart";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * POST /api/cart
 * Validates stock and syncs the WooCommerce Store API cart (session) to match client line items.
 */
export async function POST(req: NextRequest) {
  if (req.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(req, response);
  }
  try {
    const body = await req.json();
    const { items, couponCode } = body;

    if (!Array.isArray(items)) {
      return secureResponse({ error: "Invalid items array" }, { status: 400 });
    }

    const stockCheck = await validateCartLineStock(items as CartItem[]);
    if (!stockCheck.valid) {
      return applyCorsHeaders(
        req,
        secureResponse(
          { error: "Cart validation failed", errors: stockCheck.errors },
          { status: 400 }
        )
      );
    }

    const cartPayload = await syncCartViaStoreApi(req, items as CartItem[], couponCode);

    return applyCorsHeaders(req, secureResponse({ success: true, cart: cartPayload }));
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Cart API error:", error);
    }
    return applyCorsHeaders(
      req,
      secureResponse(
        {
          error:
            (error instanceof Error ? error.message : "An error occurred") || "Failed to sync cart",
        },
        { status: 500 }
      )
    );
  }
}
