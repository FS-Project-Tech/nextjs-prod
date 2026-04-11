import { NextRequest, NextResponse } from "next/server";
import { createProtectedApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";
import { fetchAllLegacyOrdersForCustomer } from "@/lib/dashboard/legacy-orders-api";
import { fetchWooOrderDetailForUser } from "@/lib/dashboard/fetch-woo-order-for-user";
import {
  formatDashboardOrderDetail,
  orderDateMs,
  orderRefMatchesRow,
  ORDER_DETAIL_CUTOFF_MS,
} from "@/lib/dashboard/format-dashboard-order-detail";
import { enrichLineItemsWithWooSkus } from "@/lib/dashboard/enrich-woo-line-item-skus";

function parseCustomerId(user: { id?: unknown }): number | null {
  if (user?.id == null) return null;
  const n = typeof user.id === "number" ? user.id : parseInt(String(user.id), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function sessionEmail(user: { email?: unknown }): string | null {
  if (user?.email == null) return null;
  const s = String(user.email).trim().toLowerCase();
  return s || null;
}

/**
 * GET /api/dashboard/orders/[id]
 * Authenticated order detail: WooCommerce (on/after cutoff) or legacy (before cutoff), ownership enforced.
 */
async function getOrderDetail(
  req: NextRequest,
  context: { user: any; token: string },
  routeParams: Promise<{ id: string }>,
) {
  try {
    const { user } = context;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customerId = parseCustomerId(user);
    if (customerId == null) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 401 });
    }

    const { id: idParam } = await routeParams;
    const ref = decodeURIComponent(idParam || "").trim();
    if (!ref) {
      return NextResponse.json({ error: "Order reference is required" }, { status: 400 });
    }

    const email = sessionEmail(user);

    const [woo, legacyRows] = await Promise.all([
      fetchWooOrderDetailForUser(ref, customerId, email),
      fetchAllLegacyOrdersForCustomer(customerId, email, "[orders/[id]]"),
    ]);

    const legacyMatch =
      legacyRows.find((row) => orderRefMatchesRow(row, ref)) ?? null;

    const wooMs = woo ? orderDateMs(String(woo.date_created ?? "")) : null;
    const legacyMs = legacyMatch
      ? orderDateMs(String(legacyMatch.date_created ?? legacyMatch.date ?? ""))
      : null;

    let raw: Record<string, unknown> | null = null;
    let source: "woo" | "legacy" | null = null;

    if (woo && wooMs != null && wooMs >= ORDER_DETAIL_CUTOFF_MS) {
      raw = woo;
      source = "woo";
    } else if (legacyMatch && legacyMs != null && legacyMs < ORDER_DETAIL_CUTOFF_MS) {
      raw = legacyMatch as Record<string, unknown>;
      source = "legacy";
    } else if (woo) {
      raw = woo;
      source = "woo";
    } else if (legacyMatch) {
      raw = legacyMatch as Record<string, unknown>;
      source = "legacy";
    }

    if (!raw || !source) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = formatDashboardOrderDetail(raw, source);
    // Legacy product IDs are not WooCommerce catalog IDs — Woo enrichment would 404 or mismatch.
    if (source === "woo") {
      order.line_items = await enrichLineItemsWithWooSkus(
        order.line_items as Record<string, unknown>[],
      );
    }
    const sanitized = sanitizeObject(order as Record<string, unknown>);

    return NextResponse.json({ order: sanitized });
  } catch (error) {
    console.error("[orders/[id]] detail error:", error);
    return NextResponse.json(
      { error: "Failed to load order" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  segmentContext: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await segmentContext.params;
  const handler = createProtectedApiHandler(
    (request, ctx) => getOrderDetail(request, ctx, Promise.resolve(resolvedParams)),
    {
      rateLimit: { windowMs: 60_000, maxRequests: 60 },
      timeout: API_TIMEOUT.DEFAULT,
      sanitize: true,
      allowedMethods: ["GET"],
    },
  );
  return handler(req);
}
