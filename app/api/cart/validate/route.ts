import { NextRequest, NextResponse } from "next/server";
import type { CartItem } from "@/lib/types/cart";
import { validateCartLineStock } from "@/lib/woo-rest-server";
import { rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

export async function POST(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
  }

  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
  })(req);
  if (rateLimitCheck) return applyCorsHeaders(req, rateLimitCheck);

  try {
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return applyCorsHeaders(req, secureResponse({ error: "Invalid items array" }, { status: 400 }));
    }

    const validation = await validateCartLineStock(items as CartItem[]);
    return applyCorsHeaders(
      req,
      secureResponse({ valid: validation.valid, errors: validation.errors })
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Cart validation error:", error);
    }
    return applyCorsHeaders(
      req,
      secureResponse(
        {
          error:
            (error instanceof Error ? error.message : "An error occurred") || "Failed to validate cart",
          valid: false,
          errors: [],
        },
        { status: 500 }
      )
    );
  }
}
