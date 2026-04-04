import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-server";
import { getWCSessionHeaders } from "@/lib/woocommerce-session";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * POST /api/wc/checkout
 * @deprecated This endpoint is deprecated. Use /api/checkout instead.
 * Returns 410 Gone status to indicate the resource is permanently removed.
 */
export async function POST(req: NextRequest) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(req, response);
  }

  // Return 410 Gone - resource permanently removed
  return secureResponse(
    {
      error: "This endpoint has been permanently removed. Use /api/checkout instead.",
      deprecated: true,
      alternative: "/api/checkout",
    },
    { status: 410 }
  );
}

/**
 * GET /api/wc/checkout
 * Get checkout data (shipping methods, payment methods, etc.)
 */
export async function GET(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return secureResponse({ error: "WordPress URL not configured" }, { status: 500 });
    }

    // Get WooCommerce session headers
    const sessionHeaders = await getWCSessionHeaders();

    try {
      // Try to get checkout data from Store API
      const response = await fetch(`${wpBase}/wp-json/wc/store/v1/checkout`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...sessionHeaders,
        },
        cache: "no-store",
      });

      if (response.ok) {
        const checkout = await response.json();
        return secureResponse({ success: true, checkout });
      }
    } catch (error) {
      // Store API not available
    }

    // Fallback: Return basic checkout structure
    return secureResponse({
      success: true,
      checkout: {
        shipping_methods: [],
        payment_methods: [],
        billing_fields: [],
        shipping_fields: [],
      },
      message: "WooCommerce Store API not available. Using fallback data.",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("WC checkout GET error:", error);
    }

    const errorResponse = secureResponse({ error: "Failed to get checkout data" }, { status: 500 });
    return applyCorsHeaders(req, errorResponse);
  }
}
