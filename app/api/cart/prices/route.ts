import { NextRequest, NextResponse } from "next/server";
import { updateCartPrices } from "@/lib/cart-sync";
import type { CartItem } from "@/lib/types/cart";
import { rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * POST /api/cart/prices
 * Update cart item prices from WooCommerce
 * Protected with rate limiting
 */
export async function POST(req: NextRequest) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(req, response);
  }

  // Apply rate limiting
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 price updates per minute per IP
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }
  try {
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      const response = secureResponse(
        { error: "Invalid items array" },
        { status: 400 }
      );
      return applyCorsHeaders(req, response);
    }

    const priceMap = await updateCartPrices(items as CartItem[]);

    // Convert Map to object for JSON response
    const prices: Record<string, string> = {};
    priceMap.forEach((price, id) => {
      prices[id] = price;
    });

    const response = secureResponse({
      success: true,
      prices,
    });
    return applyCorsHeaders(req, response);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Price update error:", error);
    }
    const errorResponse = secureResponse(
      {
        error: (error instanceof Error ? error.message : 'An error occurred') || "Failed to update prices",
      },
      { status: 500 }
    );
    return applyCorsHeaders(req, errorResponse);
  }
}


