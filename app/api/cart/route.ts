import { NextRequest, NextResponse } from "next/server";
import { pushClientCartToWooSession } from "@/lib/store-cart-sync";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import type { CartItem } from "@/lib/types/cart";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * POST /api/cart
 * Validates stock (when non-empty) and pushes the client cart to Woo: clear session cart, then re-add all lines.
 * Response does not include a cart body for hydrating Zustand — client store is authoritative.
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

    const lines = items as CartItem[];

    if (lines.length > 0) {
      const stockCheck = await validateCartLineStock(lines);
      if (!stockCheck.valid) {
        return applyCorsHeaders(
          req,
          secureResponse(
            { error: "Cart validation failed", errors: stockCheck.errors },
            { status: 400 }
          )
        );
      }
    }

    const { lineCount, rawCart } = await pushClientCartToWooSession(req, lines, couponCode);

    if (process.env.NODE_ENV === "development") {
      console.log("[api/cart] push", { clientLines: lines.length, wooLineCount: lineCount });
    }

    return applyCorsHeaders(
      req,
      secureResponse({
        success: true,
        lineCount,
        clientLineCount: lines.length,
        ...(process.env.NODE_ENV === "development"
          ? { debugWooItemIds: Array.isArray(rawCart.items) ? rawCart.items.map((i) => i.id) : [] }
          : {}),
      })
    );
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
