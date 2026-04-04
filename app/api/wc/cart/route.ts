import { NextRequest, NextResponse } from "next/server";
import { secureResponse } from "@/lib/security-headers";
import { applyCorsHeaders } from "@/lib/cors";

/**
 * GET /api/wc/cart
 * Loads cart linked to logged-in WordPress user (NOT browser session)
 */
export async function GET(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const wpBase = process.env.WC_API_URL?.replace("/wp-json/wc/v3", "") || "";

    if (!wpBase) {
      return secureResponse({ error: "WordPress URL not configured" }, { status: 500 });
    }

    /**
     * 🔥 IMPORTANT:
     * Forward ALL cookies from request.
     * This includes WordPress login cookies.
     * This is what makes cart user-based instead of session-based.
     */
    const cookieHeader = req.headers.get("cookie") || "";

    const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookieHeader, // 🔥 critical fix
      },
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return secureResponse(
        {
          error: "Failed to fetch WooCommerce cart",
          status: response.status,
          body: text,
        },
        { status: response.status }
      );
    }

    const cart = await response.json();

    const successResponse = secureResponse({
      success: true,
      cart,
    });

    return applyCorsHeaders(req, successResponse);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("WC cart GET error:", error);
    }

    const errorResponse = secureResponse({ error: "Failed to get cart" }, { status: 500 });

    return applyCorsHeaders(req, errorResponse);
  }
}

/**
 * POST /api/wc/cart
 * Add item to user-based cart
 */
export async function POST(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const body = await req.json().catch(() => ({}));
    const { product_id, quantity = 1, variation_id } = body;

    if (!product_id) {
      return secureResponse({ error: "Product ID is required" }, { status: 400 });
    }

    const wpBase = process.env.WC_API_URL?.replace("/wp-json/wc/v3", "") || "";

    if (!wpBase) {
      return secureResponse({ error: "WordPress URL not configured" }, { status: 500 });
    }

    /**
     * 🔥 Forward login cookies
     */
    const cookieHeader = req.headers.get("cookie") || "";

    const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart/add-item`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookieHeader, // 🔥 critical fix
      },
      credentials: "include",
      body: JSON.stringify({
        id: product_id,
        quantity,
        variation_id,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return secureResponse(
        {
          error: "Failed to add item to cart",
          status: response.status,
          body: text,
        },
        { status: response.status }
      );
    }

    const cart = await response.json();

    const successResponse = secureResponse({
      success: true,
      cart,
    });

    return applyCorsHeaders(req, successResponse);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("WC cart POST error:", error);
    }

    const errorResponse = secureResponse({ error: "Failed to add item to cart" }, { status: 500 });

    return applyCorsHeaders(req, errorResponse);
  }
}
