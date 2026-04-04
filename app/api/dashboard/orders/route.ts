import { NextRequest, NextResponse } from "next/server";
import { createProtectedApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";
import { getWpBaseUrl } from "@/lib/wp-utils";
import wcAPI from "@/lib/woocommerce";

/**
 * GET /api/dashboard/orders
 * Fetch orders for the authenticated user via WooCommerce REST API (customer-scoped).
 * Uses the WordPress user ID from the session to query orders by customer ID.
 */
async function getOrders(req: NextRequest, context: { user: any; token: string }) {
  try {
    const { user, token } = context;

    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Unable to determine current user for orders" },
        { status: 401 }
      );
    }

    // Link guest orders to customer (for users who registered after placing guest order)
    const wpBase = getWpBaseUrl();
    if (wpBase && token) {
      try {
        await fetch(`${wpBase}/wp-json/custom/v1/link-guest-orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
      } catch {
        // Non-blocking - continue even if link fails
      }
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = 10;
    const customerId = typeof user.id === "number" ? user.id : parseInt(String(user.id), 10);
    if (Number.isNaN(customerId) || customerId <= 0) {
      return NextResponse.json({ error: "Invalid user id for orders" }, { status: 401 });
    }

    const wcResponse = await wcAPI.get("/orders", {
      params: {
        customer: customerId,
        per_page: perPage,
        page,
        orderby: "date",
        order: "desc",
      },
    });

    const gatewayOrders = wcResponse.data || [];
    const h = (wcResponse.headers || {}) as Record<string, string>;
    const total = parseInt(h["x-wp-total"] || h["X-WP-Total"] || "0", 10);
    const totalPages = parseInt(h["x-wp-totalpages"] || h["X-WP-TotalPages"] || "0", 10);

    const transformedOrders = gatewayOrders.map((order: any) => {
      const line_items = (order.line_items || []).map((item: any) => ({
        id: item.id,
        name: item.name || "",
        quantity: item.quantity || 0,
        price: item.price?.toString() || order.total?.toString() || "0",
        product_id: item.product_id || 0,
        image: item.image || undefined,
      }));

      return {
        id: order.id,
        order_number: order.number || order.id,
        status: order.status,
        date_created: order.date_created,
        total: order.total?.toString() || "0",
        currency: order.currency || "AUD",
        line_items,
        billing: order.billing || {
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          address_1: "",
          address_2: "",
          city: "",
          state: "",
          postcode: "",
          country: "",
        },
        shipping: order.shipping || {
          first_name: "",
          last_name: "",
          address_1: "",
          address_2: "",
          city: "",
          state: "",
          postcode: "",
          country: "",
        },
      };
    });
    const sanitizedOrders = transformedOrders.map((order: any) => sanitizeObject(order));

    return NextResponse.json({
      orders: sanitizedOrders,
      pagination: {
        page,
        per_page: perPage,
        total: total || sanitizedOrders.length,
        total_pages: totalPages || (sanitizedOrders.length ? 1 : 0),
      },
    });
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json({ error: "An error occurred while fetching orders" }, { status: 500 });
  }
}

// Export with security middleware
export const GET = createProtectedApiHandler(getOrders, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute (lower for authenticated routes)
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["GET"],
});
