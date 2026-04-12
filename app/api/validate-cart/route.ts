import { NextRequest, NextResponse } from "next/server";
import type { CartItem } from "@/lib/types/cart";
import { runFullCartValidation } from "@/lib/cart/validate-cart-full";
import { rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * POST /api/validate-cart
 * Validates stock and refreshes line prices from Woo. Returns `items` to merge into Zustand (replaceItems).
 */
export async function POST(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
  }

  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
  })(req);
  if (rateLimitCheck) return applyCorsHeaders(req, rateLimitCheck);

  try {
    const body = await req.json();
    const { items } = body as { items?: unknown };

    if (!Array.isArray(items)) {
      return applyCorsHeaders(req, secureResponse({ error: "Invalid items array" }, { status: 400 }));
    }

    const result = await runFullCartValidation(items as CartItem[]);

    if (process.env.NODE_ENV === "development") {
      console.log("[api/validate-cart]", {
        valid: result.valid,
        lineCount: result.items.length,
        errors: result.errors.length,
      });
    }

    return applyCorsHeaders(
      req,
      secureResponse({
        valid: result.valid,
        errors: result.errors,
        items: result.items,
      }),
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[api/validate-cart]", error);
    }
    return applyCorsHeaders(
      req,
      secureResponse(
        {
          error:
            (error instanceof Error ? error.message : "An error occurred") || "Failed to validate cart",
          valid: false,
          errors: [] as Array<{ itemId: string; message: string }>,
          items: [] as CartItem[],
        },
        { status: 500 },
      ),
    );
  }
}
