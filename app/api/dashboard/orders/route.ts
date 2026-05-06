import { NextRequest, NextResponse } from "next/server";
import { createProtectedApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";
import {
  fetchLegacyOrdersForDashboardCached,
  fetchWooOrdersForDashboardCached,
} from "@/lib/dashboard/orders-upstream-cache";
import {
  extractLegacyLineItemSku,
  extractLineItemSku,
} from "@/lib/dashboard/format-dashboard-order-detail";
import {
  orderCreatedMsForSort,
  orderDateYmdInStoreTz,
} from "@/lib/order/order-created-date";

/** Orders strictly before this instant are legacy; on/after are WooCommerce. */
const CUTOFF_DATE = new Date("2026-04-07");
const CUTOFF_MS = CUTOFF_DATE.getTime();

const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
]);

type OrderSource = "legacy" | "woo";

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

/** Session email for legacy API (often required for permission_callback alongside token). */
function sessionEmail(user: { email?: unknown }): string | null {
  if (user?.email == null) return null;
  const s = String(user.email).trim().toLowerCase();
  return s || null;
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

function normalizeLegacyLineItems(raw: unknown): NormalizedOrder["line_items"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: Record<string, unknown>) => {
    const vid = Number(row.variation_id ?? 0);
    const sku = extractLegacyLineItemSku(row);
    const out: NormalizedOrder["line_items"][number] = {
      id: Number(row.id) || 0,
      name: String(row.name ?? row.product_name ?? ""),
      quantity: Number(row.quantity) || 0,
      price: String(row.price ?? row.total ?? "0"),
      product_id: Number(row.product_id) || 0,
      variation_id: Number.isFinite(vid) && vid > 0 ? vid : undefined,
      image: lineItemImage(row.image),
    };
    if (sku) out.sku = sku;
    return out;
  });
}

function normalizeLegacyOrder(order: Record<string, unknown>): NormalizedOrder | null {
  const id = Number(order.id);
  if (!Number.isFinite(id)) return null;
  const date_created = String(order.date_created ?? order.date ?? "");
  const lineSource = order.line_items ?? order.items;
  return {
    id,
    order_number: (order.number ?? order.order_number ?? id) as string | number,
    date_created,
    status: String(order.status ?? ""),
    total: String(order.total ?? "0"),
    currency: String(order.currency ?? "AUD"),
    source: "legacy",
    line_items: normalizeLegacyLineItems(lineSource),
    billing: emptyBilling(),
    shipping: emptyShipping(),
  };
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
    },
  );
  const billing =
    order.billing && typeof order.billing === "object"
      ? { ...emptyBilling(), ...(order.billing as Record<string, string>) }
      : emptyBilling();
  const shipping =
    order.shipping && typeof order.shipping === "object"
      ? { ...emptyShipping(), ...(order.shipping as Record<string, string>) }
      : emptyShipping();
  const date_created = String(order.date_created ?? "");
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
  };
}

/**
 * GET /api/dashboard/orders
 * Hybrid: legacy orders before cutoff, WooCommerce on/after; merged, sorted, paginated.
 *
 * Query: page, per_page (max 50, default 5), status, date_from, date_to (YYYY-MM-DD, inclusive, store TZ), search
 *
 * Performance: Woo + legacy upstream lists are cached with `unstable_cache` (see
 * `lib/dashboard/orders-upstream-cache.ts`). Tune with DASHBOARD_ORDERS_CACHE_SECONDS (default 60, max 300).
 * Date/status/search filters run in-memory on the cached merge (changing dates does not bust Woo/legacy fetch cache).
 */
async function getOrders(req: NextRequest, context: { user: any; token: string }) {
  try {
    const { user } = context;

    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Unable to determine current user for orders" },
        { status: 401 },
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

    const userEmail = sessionEmail(user);

    const statusFilter = parseListStatus(searchParams.get("status"));
    const dateFrom = parseDateYmd(searchParams.get("date_from"));
    const dateTo = parseDateYmd(searchParams.get("date_to"));
    const searchFilter = parseOrdersSearch(searchParams.get("search"));

    const statusCacheKey = statusFilter ?? "";
    const searchCacheKey = searchFilter ?? "";

    const [wooRaw, legacyRaw] = await Promise.all([
      fetchWooOrdersForDashboardCached(customerId, statusCacheKey, searchCacheKey),
      fetchLegacyOrdersForDashboardCached(customerId, userEmail),
    ]);

    const merged: NormalizedOrder[] = [];

    for (const row of legacyRaw) {
      const n = normalizeLegacyOrder(row);
      if (!n) continue;
      if (orderCreatedMsForSort(n.date_created) >= CUTOFF_MS) continue;
      merged.push(n);
    }

    for (const row of wooRaw) {
      const n = normalizeWooOrder(row);
      if (!n) continue;
      if (orderCreatedMsForSort(n.date_created) < CUTOFF_MS) continue;
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
          o.line_items.some((li) => li.name.toLowerCase().includes(q)),
      );
    }

    filtered.sort(
      (a, b) => orderCreatedMsForSort(b.date_created) - orderCreatedMsForSort(a.date_created),
    );

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const pageSlice = filtered.slice(start, start + perPage);
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);

    const sanitizedOrders = pageSlice.map((order) => sanitizeObject(order as Record<string, unknown>));

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