import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import wcAPI from "@/lib/woocommerce";

/**
 * GET /api/dashboard/customer
 * Fetch customer stats (orders count, total spent) via WooCommerce REST API.
 * Uses Consumer Key/Secret for WooCommerce; user ID from wp/v2/users/me for customer filter.
 */
export async function GET(req: NextRequest) {
  try {
    // Get NextAuth session and WP JWT
    // new
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const wpToken = (nextAuthToken as any)?.wpToken;

    if (!wpToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    // Get user data
    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${wpToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }

    const user = await userResponse.json();

    // Link guest orders to customer (for users who registered after placing guest order)
    try {
      await fetch(`${wpBase}/wp-json/custom/v1/link-guest-orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${wpToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
    } catch {
      // Non-blocking - continue even if link fails
    }

    // Initialize stats
    let ordersCount = 0;
    let totalSpent = "0";
    let currency = "AUD";

    // Fetch orders via WooCommerce REST API (Consumer Key/Secret, not JWT)
    const customerId = typeof user.id === "number" ? user.id : parseInt(String(user.id), 10);
    if (!Number.isNaN(customerId) && customerId > 0) {
      try {
        if (process.env.NODE_ENV === "development") {
          console.log(
            "[dashboard/customer] Fetching orders for customerId:",
            customerId,
            "WC_API_URL:",
            process.env.WC_API_URL ? "set" : "NOT SET"
          );
        }
        const wcResponse = await wcAPI.get("/orders", {
          params: {
            customer: customerId,
            per_page: 100,
            page: 1,
            orderby: "date",
            order: "desc",
          },
        });

        const allOrders = Array.isArray(wcResponse.data) ? wcResponse.data : [];
        const h = (wcResponse.headers || {}) as Record<string, string>;
        const totalFromHeaders = parseInt(h["x-wp-total"] || h["X-WP-Total"] || "0", 10);
        if (process.env.NODE_ENV === "development") {
          console.log("[dashboard/customer] WooCommerce orders:", {
            returned: allOrders.length,
            "x-wp-total": totalFromHeaders,
          });
        }
        if (allOrders.length > 0 || totalFromHeaders > 0) {
          ordersCount = totalFromHeaders > 0 ? totalFromHeaders : allOrders.length;

          const completedOrders = allOrders.filter((order: any) => {
            const status = (order.status || "").toLowerCase();
            return status === "completed" || status === "processing";
          });

          totalSpent = completedOrders
            .reduce((sum: number, order: any) => sum + parseFloat(order.total || 0), 0)
            .toFixed(2);

          if (allOrders[0]?.currency) {
            currency = allOrders[0].currency;
          }
        }
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
        console.error("[dashboard/customer] Error fetching orders:", {
          customerId,
          status: ax.response?.status,
          message: ax.message,
          data: ax.response?.data,
        });
      }
    }

    return NextResponse.json({
      orders_count: ordersCount,
      total_spent: totalSpent,
      currency: currency,
      date_created: user.date || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Customer API error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching customer data" },
      { status: 500 }
    );
  }
}
