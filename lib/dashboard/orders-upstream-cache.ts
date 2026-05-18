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

async function fetchAllWooOrdersUncached(
  customerId: number,
  statusKey: string,
  searchKey: string,
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

const wooOrdersCached = unstable_cache(
  async (customerId: number, statusKey: string, searchKey: string) =>
    fetchAllWooOrdersUncached(customerId, statusKey, searchKey),
  ["dashboard-orders-woo-upstream"],
  { revalidate: REVALIDATE_SEC },
);

const legacyOrdersCached = unstable_cache(
  async (customerId: number, emailKey: string) =>
    fetchAllLegacyOrdersForCustomer(
      customerId,
      emailKey === "" ? null : emailKey,
      "[orders]",
    ),
  ["dashboard-orders-legacy-upstream"],
  { revalidate: REVALIDATE_SEC },
);

/**
 * Cached WooCommerce order pages for dashboard merge (per customer + WC query shape).
 */
export function fetchWooOrdersForDashboardCached(
  customerId: number,
  statusKey: string,
  searchKey: string,
): Promise<Record<string, unknown>[]> {
  return wooOrdersCached(customerId, statusKey, searchKey);
}

/**
 * Cached legacy order list for dashboard merge (per customer + session email key).
 */
export function fetchLegacyOrdersForDashboardCached(
  customerId: number,
  email: string | null,
): Promise<Record<string, unknown>[]> {
  return legacyOrdersCached(customerId, email ?? "");
}
