import { NextRequest, NextResponse } from "next/server";
import type { CartItem } from "@/lib/types/cart";
import { validateCartItems } from "@/lib/cart-sync";
import { rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * POST /api/cart/validate
 * Validate cart items (stock, availability, prices)
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
    maxRequests: 20, // 20 validations per minute per IP
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

    const validation = await validateCartItems(items as CartItem[]);

    const response = secureResponse({
      valid: validation.valid,
      errors: validation.errors,
    });
    return applyCorsHeaders(req, response);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Cart validation error:", error);
    }
    const errorResponse = secureResponse(
      {
        error: (error instanceof Error ? error.message : 'An error occurred') || "Failed to validate cart",
        valid: false,
        errors: [],
      },
      { status: 500 }
    );
    return applyCorsHeaders(req, errorResponse);
  }
}


