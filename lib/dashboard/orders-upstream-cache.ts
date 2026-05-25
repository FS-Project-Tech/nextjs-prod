import "server-only";

import { unstable_cache } from "next/cache";
import wcAPI from "@/lib/woocommerce";
import { fetchAllLegacyOrdersForCustomer } from "@/lib/dashboard/legacy-orders-api";

/** Server-side cache TTL for merged upstream fetches (seconds). Override with DASHBOARD_ORDERS_CACHE_SECONDS. */
const REVALIDATE_SEC = (() => {
  const n = parseInt(process.env.DASHBOARD_ORDERS_CACHE_SECONDS || "60", 10);
  if (!Number.isFinite(n)) return 60;
  return Math.max(15, Math.min(300, n));
})();

const MAX_PAGES = 25;
const PER_PAGE = 100;

/**
 * Lean Woo list fields — keeps line_items for search/SKU; billing/shipping for list cards if needed.
 * Omit heavy meta at order root.
 */
const WC_ORDERS_LIST_FIELDS =
  "id,number,status,total,currency,date_created,line_items,billing,shipping,meta_data";
const WC_ORDERS_PAGE_FIELDS =
  "id,number,status,total,currency,date_created,billing,shipping,meta_data";

export type WooOrdersPageResult = {
  orders: Record<string, unknown>[];
  total: number;
  totalPages: number;
};

function parseWooHeaderInt(
  headers: Record<string, string>,
  lowerName: string,
  fallback: number
): number {
  const canonicalName = lowerName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
  const value =
    headers[lowerName] || headers[canonicalName] || headers[lowerName.toUpperCase()] || "";
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchAllWooOrdersUncached(
  customerId: number,
  statusKey: string,
  searchKey: string
): Promise<Record<string, unknown>[]> {
  const wcBaseParams: Record<string, string | number> = {
    customer: customerId,
  };
  if (statusKey) wcBaseParams.status = statusKey;
  if (searchKey) wcBaseParams.search = searchKey;

  const acc: Record<string, unknown>[] = [];
  try {
    for (let p = 1; p <= MAX_PAGES; p++) {
      const wcResponse = await wcAPI.get("/orders", {
        params: {
          ...wcBaseParams,
          page: p,
          per_page: PER_PAGE,
          orderby: "date",
          order: "desc",
          _fields: WC_ORDERS_LIST_FIELDS,
        },
      });
      const batch = (wcResponse.data || []) as Record<string, unknown>[];
      if (!batch.length) break;
      acc.push(...batch);
      const h = (wcResponse.headers || {}) as Record<string, string>;
      const totalPages = parseInt(h["x-wp-totalpages"] || h["X-WP-TotalPages"] || "1", 10);
      if (p >= totalPages) break;
    }
  } catch (e) {
    console.error("[orders] WooCommerce fetch failed:", e);
  }
  return acc;
}

async function fetchWooOrdersPageUncached(
  customerId: number,
  statusKey: string,
  page: number,
  perPage: number
): Promise<WooOrdersPageResult> {
  const wcBaseParams: Record<string, string | number> = {
    customer: customerId,
  };
  if (statusKey) wcBaseParams.status = statusKey;

  try {
    const wcResponse = await wcAPI.get("/orders", {
      params: {
        ...wcBaseParams,
        page,
        per_page: perPage,
        orderby: "date",
        order: "desc",
        _fields: WC_ORDERS_PAGE_FIELDS,
      },
    });
    const orders = (wcResponse.data || []) as Record<string, unknown>[];
    const h = (wcResponse.headers || {}) as Record<string, string>;
    const total = parseWooHeaderInt(h, "x-wp-total", orders.length);
    const totalPages = parseWooHeaderInt(
      h,
      "x-wp-totalpages",
      total === 0 ? 0 : Math.ceil(total / perPage)
    );
    return { orders, total, totalPages };
  } catch (e) {
    console.error("[orders] WooCommerce paged fetch failed:", e);
    return { orders: [], total: 0, totalPages: 0 };
  }
}

const wooOrdersCached = unstable_cache(
  async (customerId: number, statusKey: string, searchKey: string) =>
    fetchAllWooOrdersUncached(customerId, statusKey, searchKey),
  ["dashboard-orders-woo-upstream"],
  { revalidate: REVALIDATE_SEC }
);

const wooOrdersPageCached = unstable_cache(
  async (customerId: number, statusKey: string, page: number, perPage: number) =>
    fetchWooOrdersPageUncached(customerId, statusKey, page, perPage),
  ["dashboard-orders-woo-page-upstream"],
  { revalidate: REVALIDATE_SEC }
);

const legacyOrdersCached = unstable_cache(
  async (customerId: number, emailKey: string) =>
    fetchAllLegacyOrdersForCustomer(customerId, emailKey === "" ? null : emailKey, "[orders]"),
  ["dashboard-orders-legacy-upstream"],
  { revalidate: REVALIDATE_SEC }
);

/**
 * Cached WooCommerce order pages for dashboard merge (per customer + WC query shape).
 */
export function fetchWooOrdersForDashboardCached(
  customerId: number,
  statusKey: string,
  searchKey: string
): Promise<Record<string, unknown>[]> {
  return wooOrdersCached(customerId, statusKey, searchKey);
}

/**
 * Cached WooCommerce order page for the common dashboard list path.
 */
export function fetchWooOrdersPageForDashboardCached(
  customerId: number,
  statusKey: string,
  page: number,
  perPage: number
): Promise<WooOrdersPageResult> {
  return wooOrdersPageCached(customerId, statusKey, page, perPage);
}

/**
 * Uncached page fetch for status-sensitive refreshes, e.g. pending eWAY orders
 * immediately after payment verification.
 */
export function fetchWooOrdersPageForDashboardUncached(
  customerId: number,
  statusKey: string,
  page: number,
  perPage: number
): Promise<WooOrdersPageResult> {
  return fetchWooOrdersPageUncached(customerId, statusKey, page, perPage);
}

/**
 * Cached legacy order list for dashboard merge (per customer + session email key).
 */
export function fetchLegacyOrdersForDashboardCached(
  customerId: number,
  email: string | null
): Promise<Record<string, unknown>[]> {
  return legacyOrdersCached(customerId, email ?? "");
}
