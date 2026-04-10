import { NextRequest, NextResponse } from "next/server";
import { createProtectedApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";
import wcAPI from "@/lib/woocommerce";

/** Lean order payload for dashboard list (avoids meta, full billing/shipping, fee lines, etc.). */
const WC_ORDERS_LIST_FIELDS =
  "id,number,status,total,currency,date_created,line_items";

const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
]);

function parseListStatus(raw: string | null): string | undefined {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || !ALLOWED_ORDER_STATUSES.has(s)) return undefined;
  return s;
}

/** `YYYY-MM-DD` only */
function parseDateYmd(raw: string | null): string | undefined {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

function parseOrdersSearch(raw: string | null): string | undefined {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  return s.slice(0, 100);
}

/**
 * GET /api/dashboard/orders
 * Fetch orders for the authenticated user via WooCommerce REST API (customer-scoped).
 * Uses the WordPress user ID from the session to query orders by customer ID.
 *
 * Query: page, per_page (max 50), status, date_from, date_to (YYYY-MM-DD), search
 */
async function getOrders(req: NextRequest, context: { user: any; token: string }) {
  try {
    const { user } = context;

    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Unable to determine current user for orders" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.min(500, Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1));
    const perPageRaw = parseInt(searchParams.get("per_page") || "15", 10) || 15;
    const perPage = Math.min(50, Math.max(1, perPageRaw));
    const customerId = typeof user.id === "number" ? user.id : parseInt(String(user.id), 10);
    if (Number.isNaN(customerId) || customerId <= 0) {
      return NextResponse.json({ error: "Invalid user id for orders" }, { status: 401 });
    }

    const statusFilter = parseListStatus(searchParams.get("status"));
    const dateFrom = parseDateYmd(searchParams.get("date_from"));
    const dateTo = parseDateYmd(searchParams.get("date_to"));
    const searchFilter = parseOrdersSearch(searchParams.get("search"));

    const wcParams: Record<string, string | number> = {
      customer: customerId,
      per_page: perPage,
      page,
      orderby: "date",
      order: "desc",
      _fields: WC_ORDERS_LIST_FIELDS,
    };

    if (statusFilter) wcParams.status = statusFilter;
    if (dateFrom) wcParams.after = `${dateFrom}T00:00:00`;
    if (dateTo) wcParams.before = `${dateTo}T23:59:59`;
    if (searchFilter) wcParams.search = searchFilter;

    const wcResponse = await wcAPI.get("/orders", {
      params: wcParams,
    });

    const gatewayOrders = wcResponse.data || [];
    const h = (wcResponse.headers || {}) as Record<string, string>;
    const total = parseInt(h["x-wp-total"] || h["X-WP-Total"] || "0", 10);
    const totalPages = parseInt(h["x-wp-totalpages"] || h["X-WP-TotalPages"] || "0", 10);

    const lineItemImage = (image: unknown): string | undefined => {
      if (image == null) return undefined;
      if (typeof image === "string" && image.trim()) return image.trim();
      if (typeof image === "object" && image !== null && "src" in image) {
        const src = (image as { src?: string }).src;
        return typeof src === "string" && src.trim() ? src.trim() : undefined;
      }
      return undefined;
    };

    const transformedOrders = gatewayOrders.map((order: any) => {
      const line_items = (order.line_items || []).map((item: any) => {
        const vid = Number(item.variation_id ?? 0);
        return {
          id: item.id,
          name: item.name || "",
          quantity: item.quantity || 0,
          price: item.price?.toString() || order.total?.toString() || "0",
          product_id: item.product_id || 0,
          variation_id: Number.isFinite(vid) && vid > 0 ? vid : undefined,
          image: lineItemImage(item.image),
        };
      });

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
