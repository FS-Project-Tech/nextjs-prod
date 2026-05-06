import "server-only";

import type { WooCommerceProduct } from "./types";
import { wcGet } from "./wc-fetch";

const PER_PAGE = 100;
const BATCH = 5;

/** Hard safety ceiling (pages × 100 products). Override via SITEMAP_MAX_PRODUCT_PAGES. */
const DEFAULT_MAX_PAGES = 500;
const ABSOLUTE_CAP_PAGES = 2000;

function resolvedMaxPages(requestedMax?: number): number {
  const fromEnv = Number.parseInt(process.env.SITEMAP_MAX_PRODUCT_PAGES || "", 10);
  const base =
    typeof requestedMax === "number" && requestedMax > 0
      ? requestedMax
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : DEFAULT_MAX_PAGES;
  return Math.min(Math.max(base, 1), ABSOLUTE_CAP_PAGES);
}

/**
 * Published products for `/sitemap.xml`, aligned with {@link fetchProductBySlug} on PDP:
 * `status=publish` only — **no** `stock_status=instock` (that filter is only on shop lists via
 * {@link fetchProducts} and wrongly hid out‑of‑stock products from the sitemap).
 */
export async function fetchPublishedProductsForSitemap(options?: {
  maxPages?: number;
}): Promise<WooCommerceProduct[]> {
  const maxPages = resolvedMaxPages(options?.maxPages);

  const first = await wcGet<WooCommerceProduct[]>(
    "/products",
    {
      per_page: PER_PAGE,
      page: 1,
      orderby: "id",
      order: "asc",
      status: "publish",
    },
    "products",
  ).catch(() => null);

  if (!first?.data?.length) return [];

  const all = [...first.data];
  const totalPages = Math.min(first.wpTotalPages ?? 1, maxPages);

  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages);
    const batch = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) =>
        wcGet<WooCommerceProduct[]>(
          "/products",
          {
            per_page: PER_PAGE,
            page: start + i,
            orderby: "id",
            order: "asc",
            status: "publish",
          },
          "products",
        ).catch(() => null),
      ),
    );
    for (const res of batch) {
      if (res?.data?.length) all.push(...res.data);
    }
  }

  return all;
}
