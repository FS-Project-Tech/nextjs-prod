import { NextRequest, NextResponse } from "next/server";
import { createProtectedApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";
import {
  fetchWooOrdersForDashboardCached,
  fetchWooOrdersPageForDashboardCached,
  fetchWooOrdersPageForDashboardUncached,
} from "@/lib/dashboard/orders-upstream-cache";
import { extractLineItemSku } from "@/lib/dashboard/format-dashboard-order-detail";
import { orderCreatedMsForSort, orderDateYmdInStoreTz } from "@/lib/order/order-created-date";
import { extractMachshipTrackingTokenFromOrderMeta } from "@/lib/machship/tracking";

const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
]);

type OrderSource = "woo";

type NormalizedOrder = {
  id: number;
  order_number: string | number;
  date_created: string;
  status: string;
  total: string;
  currency: string;
  source: OrderSource;
  line_items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: string;
    product_id: number;
    variation_id?: number;
    image?: string;
    sku?: string;
  }>;
  billing: Record<string, string>;
  shipping: Record<string, string>;
  machship_tracking_token?: string;
};

type DashboardOrdersUser = {
  id?: string | number | null;
};

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

const ORDER_NAME_PARAM_MAX = 80;

/** Trim and cap length for first/last name query params (used for in-memory order matching). */
function parseOrderNameParam(raw: string | null): string {
  return String(raw ?? "")
    .trim()
    .slice(0, ORDER_NAME_PARAM_MAX);
}

function normalizeOrderNamePart(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function orderMatchesBillingOrShippingName(
  o: NormalizedOrder,
  wantFirst: string,
  wantLast: string
): boolean {
  const wf = normalizeOrderNamePart(wantFirst);
  const wl = normalizeOrderNamePart(wantLast);
  if (!wf || !wl) return true;

  const b = o.billing;
  const s = o.shipping;
  const billingMatch =
    normalizeOrderNamePart(String(b.first_name ?? "")) === wf &&
    normalizeOrderNamePart(String(b.last_name ?? "")) === wl;
  const shippingMatch =
    normalizeOrderNamePart(String(s.first_name ?? "")) === wf &&
    normalizeOrderNamePart(String(s.last_name ?? "")) === wl;
  return billingMatch || shippingMatch;
}

function lineItemImage(image: unknown): string | undefined {
  if (image == null) return undefined;
  if (typeof image === "string" && image.trim()) return image.trim();
  if (typeof image === "object" && image !== null && "src" in image) {
    const src = (image as { src?: string }).src;
    return typeof src === "string" && src.trim() ? src.trim() : undefined;
  }
  return undefined;
}

function emptyBilling(): Record<string, string> {
  return {
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
  };
}

function emptyShipping(): Record<string, string> {
  return {
    first_name: "",
    last_name: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    postcode: "",
    country: "",
  };
}

function billingNamePairEmpty(b: Record<string, string>): boolean {
  return (
    !normalizeOrderNamePart(String(b.first_name ?? "")) &&
    !normalizeOrderNamePart(String(b.last_name ?? ""))
  );
}

function shippingNamePairEmpty(s: Record<string, string>): boolean {
  return (
    !normalizeOrderNamePart(String(s.first_name ?? "")) &&
    !normalizeOrderNamePart(String(s.last_name ?? ""))
  );
}

/**
 * Billing/shipping for list + name filter — nested `billing` / `shipping` or flat Woo-style root keys.
 */
function orderBillingShippingFromPayload(order: Record<string, unknown>): {
  billing: Record<string, string>;
  shipping: Record<string, string>;
} {
  const billing =
    order.billing && typeof order.billing === "object"
      ? { ...emptyBilling(), ...(order.billing as Record<string, string>) }
      : emptyBilling();
  const shipping =
    order.shipping && typeof order.shipping === "object"
      ? { ...emptyShipping(), ...(order.shipping as Record<string, string>) }
      : emptyShipping();

  if (billingNamePairEmpty(billing)) {
    const bfn = order.billing_first_name;
    const bln = order.billing_last_name;
    if (bfn != null || bln != null) {
      billing.first_name = String(bfn ?? "").trim();
      billing.last_name = String(bln ?? "").trim();
    }
  }

  if (shippingNamePairEmpty(shipping)) {
    const sfn = order.shipping_first_name;
    const sln = order.shipping_last_name;
    if (sfn != null || sln != null) {
      shipping.first_name = String(sfn ?? "").trim();
      shipping.last_name = String(sln ?? "").trim();
    }
  }

  return { billing, shipping };
}

function normalizeWooOrder(order: Record<string, unknown>): NormalizedOrder | null {
  const id = Number(order.id);
  if (!Number.isFinite(id)) return null;
  const line_items = (Array.isArray(order.line_items) ? order.line_items : []).map(
    (item: Record<string, unknown>) => {
      const vid = Number(item.variation_id ?? 0);
      const sku = extractLineItemSku(item);
      const row: NormalizedOrder["line_items"][number] = {
        id: Number(item.id) || 0,
        name: String(item.name ?? ""),
        quantity: Number(item.quantity) || 0,
        price: String(item.price ?? order.total ?? "0"),
        product_id: Number(item.product_id) || 0,
        variation_id: Number.isFinite(vid) && vid > 0 ? vid : undefined,
        image: lineItemImage(item.image),
      };
      if (sku) row.sku = sku;
      return row;
    }
  );
  const { billing, shipping } = orderBillingShippingFromPayload(order);
  const date_created = String(order.date_created ?? "");
  const machship_tracking_token =
    extractMachshipTrackingTokenFromOrderMeta(
      Array.isArray(order.meta_data)
        ? (order.meta_data as Array<{ key?: string; value?: unknown }>)
        : undefined
    ) ?? undefined;
  return {
    id,
    order_number: (order.number ?? id) as string | number,
    date_created,
    status: String(order.status ?? ""),
    total: String(order.total ?? "0"),
    currency: String(order.currency ?? "AUD"),
    source: "woo",
    line_items,
    billing,
    shipping,
    ...(machship_tracking_token ? { machship_tracking_token } : {}),
  };
}

/**
 * GET /api/dashboard/orders
 * WooCommerce customer orders.
 * Fast path: status-only/default lists use WooCommerce pagination directly.
 * Filter path: date/search/name filters run in memory over the cached Woo list.
 *
 * Query: page, per_page (max 50, default 5), status, date_from, date_to (YYYY-MM-DD, inclusive, store TZ), search,
 *   first_name + last_name (both required): keep orders whose billing OR shipping contact matches those names (case-insensitive).
 *
 * Performance: Woo list/page requests are cached with `unstable_cache`
 * (see `lib/dashboard/orders-upstream-cache.ts`). Tune with
 * DASHBOARD_ORDERS_CACHE_SECONDS (default 60, max 300).
 */
async function getOrders(req: NextRequest, context: { user: DashboardOrdersUser; token: string }) {
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
    const perPageRaw = parseInt(searchParams.get("per_page") || "5", 10) || 5;
    const perPage = Math.min(50, Math.max(1, perPageRaw));
    const customerId = typeof user.id === "number" ? user.id : parseInt(String(user.id), 10);
    if (Number.isNaN(customerId) || customerId <= 0) {
      return NextResponse.json({ error: "Invalid user id for orders" }, { status: 401 });
    }

    const statusFilter = parseListStatus(searchParams.get("status"));
    const dateFrom = parseDateYmd(searchParams.get("date_from"));
    const dateTo = parseDateYmd(searchParams.get("date_to"));
    const searchFilter = parseOrdersSearch(searchParams.get("search"));
    const nameFirst = parseOrderNameParam(searchParams.get("first_name"));
    const nameLast = parseOrderNameParam(searchParams.get("last_name"));
    const nameProfileActive = Boolean(nameFirst && nameLast);
    const statusCacheKey = statusFilter ?? "";
    const searchCacheKey = searchFilter ?? "";
    const canUseWooPagedFastPath = !dateFrom && !dateTo && !searchFilter && !nameProfileActive;

    if (canUseWooPagedFastPath) {
      let wooPage = await fetchWooOrdersPageForDashboardCached(
        customerId,
        statusCacheKey,
        page,
        perPage
      );
      let pageSlice = wooPage.orders
        .map((row) => normalizeWooOrder(row))
        .filter((order): order is NormalizedOrder => order != null);
      const hasPendingOrder = pageSlice.some((order) => order.status.toLowerCase() === "pending");
      if (hasPendingOrder) {
        wooPage = await fetchWooOrdersPageForDashboardUncached(
          customerId,
          statusCacheKey,
          page,
          perPage
        );
        pageSlice = wooPage.orders
          .map((row) => normalizeWooOrder(row))
          .filter((order): order is NormalizedOrder => order != null);
      }
      const sanitizedOrders = pageSlice.map((order) =>
        sanitizeObject(order as Record<string, unknown>)
      );

      return NextResponse.json({
        orders: sanitizedOrders,
        total: wooPage.total,
        page,
        per_page: perPage,
        pagination: {
          page,
          per_page: perPage,
          total: wooPage.total,
          total_pages: wooPage.totalPages,
        },
      });
    }

    const wooRaw = await fetchWooOrdersForDashboardCached(
      customerId,
      statusCacheKey,
      searchCacheKey
    );

    const merged: NormalizedOrder[] = [];
    for (const row of wooRaw) {
      const n = normalizeWooOrder(row);
      if (!n) continue;
      merged.push(n);
    }

    let filtered = merged;
    if (statusFilter) {
      filtered = filtered.filter((o) => o.status.toLowerCase() === statusFilter);
    }
    if (dateFrom) {
      filtered = filtered.filter((o) => {
        const ymd = orderDateYmdInStoreTz(o.date_created);
        return ymd != null && ymd >= dateFrom;
      });
    }
    if (dateTo) {
      filtered = filtered.filter((o) => {
        const ymd = orderDateYmdInStoreTz(o.date_created);
        return ymd != null && ymd <= dateTo;
      });
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          String(o.id).includes(q) ||
          String(o.order_number).toLowerCase().includes(q) ||
          o.line_items.some((li) => li.name.toLowerCase().includes(q))
      );
    }
    if (nameProfileActive) {
      filtered = filtered.filter((o) => orderMatchesBillingOrShippingName(o, nameFirst, nameLast));
    }

    filtered.sort(
      (a, b) => orderCreatedMsForSort(b.date_created) - orderCreatedMsForSort(a.date_created)
    );

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const pageSlice = filtered.slice(start, start + perPage);
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);

    const sanitizedOrders = pageSlice.map((order) =>
      sanitizeObject(order as Record<string, unknown>)
    );

    return NextResponse.json({
      orders: sanitizedOrders,
      total,
      page,
      per_page: perPage,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
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
