import { NextRequest, NextResponse } from "next/server";
import { syncCartToWooCommerce, validateCartItems } from "@/lib/cart-sync";
import type { CartItem } from "@/lib/types/cart";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";
 
/**
 * POST /api/cart/sync
 * Sync cart with WooCommerce and get validated prices/totals
 * Includes WooCommerce session management for cart persistence
 */
export async function POST(req: NextRequest) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(req, response);
  }
  try {
    const body = await req.json();
    const { items, couponCode } = body;
 
    if (!Array.isArray(items)) {
      return secureResponse(
        { error: "Invalid items array" },
        { status: 400 }
      );
    }
 
    // Validate cart items first
    const validation = await validateCartItems(items as CartItem[]);
    if (!validation.valid) {
      const response = secureResponse(
        {
          error: "Cart validation failed",
          errors: validation.errors,
        },
        { status: 400 }
      );
      return applyCorsHeaders(req, response);
    }
 
    // Sync with WooCommerce
    const cartData = await syncCartToWooCommerce(items as CartItem[], couponCode);
 
    if (!cartData) {
      const response = secureResponse(
        { error: "Failed to sync cart" },
        { status: 500 }
      );
      return applyCorsHeaders(req, response);
    }
 
    const response = secureResponse({
      success: true,
      cart: cartData,
    });
    return applyCorsHeaders(req, response);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Cart sync error:", error);
    }
    const errorResponse = secureResponse(
      {
        error: (error instanceof Error ? error.message : 'An error occurred') || "Failed to sync cart",
      },
      { status: 500 }
    );
    return applyCorsHeaders(req, errorResponse);
  }
}