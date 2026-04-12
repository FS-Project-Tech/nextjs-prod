import { NextRequest, NextResponse } from "next/server";
import { pushClientCartToWooSession } from "@/lib/store-cart-sync";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import type { CartItem } from "@/lib/types/cart";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * POST /api/cart/add-items
 * Clears the Woo Store API cart, then re-adds every line from the client payload (Zustand snapshot).
 * Does not return a cart for hydrating client state — Zustand remains the source of truth.
 */
export async function POST(req: NextRequest) {
  if (req.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(req, response);
  }

  try {
    const body = await req.json();
    const { items, couponCode } = body as { items?: unknown; couponCode?: string };

    if (!Array.isArray(items)) {
      return applyCorsHeaders(req, secureResponse({ error: "Invalid items array" }, { status: 400 }));
    }

    const lines = items as CartItem[];

    if (lines.length > 0) {
      const stockCheck = await validateCartLineStock(lines);
      if (!stockCheck.valid) {
        return applyCorsHeaders(
          req,
          secureResponse(
            { error: "Cart validation failed", errors: stockCheck.errors },
            { status: 400 },
          ),
        );
      }
    }

    const { lineCount, rawCart } = await pushClientCartToWooSession(req, lines, couponCode);

    if (process.env.NODE_ENV === "development") {
      const wooKeys =
        Array.isArray(rawCart.items) && rawCart.items.length > 0
          ? rawCart.items.map((row) => ({ id: row.id, key: row.key, qty: row.quantity }))
          : [];
      console.log("[api/cart/add-items] push done", {
        clientLines: lines.length,
        wooLineCount: lineCount,
        wooKeys,
      });
    }

    return applyCorsHeaders(
      req,
      secureResponse({
        success: true,
        lineCount,
        clientLineCount: lines.length,
      }),
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/add-items]", error);
    }
    return applyCorsHeaders(
      req,
      secureResponse(
        {
          error:
            (error instanceof Error ? error.message : "An error occurred") || "Failed to sync cart to WooCommerce",
        },
        { status: 500 },
      ),
    );
  }
}
