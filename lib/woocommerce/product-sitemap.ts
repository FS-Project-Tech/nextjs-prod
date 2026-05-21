import "server-only";

import type { WooCommerceProduct } from "./types";
import { wcGet } from "./wc-fetch";

const PER_PAGE = 40;
const BATCH = 5;
const DEFAULT_WOO_PAGES_PER_SITEMAP = 10;
const SITEMAP_PRODUCT_FIELDS = "id,slug,date_modified,date_modified_gmt";

/** Hard safety ceiling for Woo product pages. Override via SITEMAP_MAX_PRODUCT_PAGES. */
const DEFAULT_MAX_PAGES = 500;
const ABSOLUTE_CAP_PAGES = 2000;

export type SitemapWooProduct = Pick<WooCommerceProduct, "id" | "slug"> & {
  date_modified?: string;
  date_modified_gmt?: string;
};

function productSitemapQuery(page: number): Record<string, unknown> {
  return {
    per_page: PER_PAGE,
    page,
    orderby: "id",
    order: "asc",
    status: "publish",
    _fields: SITEMAP_PRODUCT_FIELDS,
  };
}

function logProductSitemapError(error: unknown, page: number): void {
  if (process.env.NODE_ENV !== "development") return;

  const response = (error as { response?: { status?: number } })?.response;
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[sitemap] Woo product fetch failed", {
    page,
    status: response?.status,
    message: message.slice(0, 200),
  });
}

async function fetchProductSitemapWooPage(page: number) {
  return wcGet<SitemapWooProduct[]>("/products", productSitemapQuery(page), "noStore").catch(
    (error) => {
      logProductSitemapError(error, page);
      return null;
    }
  );
}

function resolvedWooPagesPerSitemap(requested?: number): number {
  const fromEnv = Number.parseInt(process.env.SITEMAP_WOO_PAGES_PER_FILE || "", 10);
  const base =
    typeof requested === "number" && requested > 0
      ? requested
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : DEFAULT_WOO_PAGES_PER_SITEMAP;
  return Math.min(Math.max(base, 1), 50);
}

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
}): Promise<SitemapWooProduct[]> {
  const maxPages = resolvedMaxPages(options?.maxPages);

  const first = await fetchProductSitemapWooPage(1);

  if (!first?.data?.length) return [];

  const all = [...first.data];
  const totalPages = Math.min(first.wpTotalPages ?? 1, maxPages);

  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages);
    const batch = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) => fetchProductSitemapWooPage(start + i))
    );
    for (const res of batch) {
      if (res?.data?.length) all.push(...res.data);
    }
  }

  return all;
}

export async function getPublishedProductSitemapPageCount(options?: {
  maxPages?: number;
  wooPagesPerSitemap?: number;
}): Promise<number> {
  const maxPages = resolvedMaxPages(options?.maxPages);
  const wooPagesPerSitemap = resolvedWooPagesPerSitemap(options?.wooPagesPerSitemap);

  const first = await fetchProductSitemapWooPage(1);

  if (!first?.data?.length) return 0;

  const totalWooPages = Math.min(first.wpTotalPages ?? 1, maxPages);
  return Math.max(1, Math.ceil(totalWooPages / wooPagesPerSitemap));
}

export async function fetchPublishedProductsForSitemapPage(
  sitemapPage: number,
  options?: {
    maxPages?: number;
    wooPagesPerSitemap?: number;
  }
): Promise<SitemapWooProduct[]> {
  if (!Number.isFinite(sitemapPage) || sitemapPage < 1) return [];

  const maxPages = resolvedMaxPages(options?.maxPages);
  const wooPagesPerSitemap = resolvedWooPagesPerSitemap(options?.wooPagesPerSitemap);
  const startPage = (Math.floor(sitemapPage) - 1) * wooPagesPerSitemap + 1;
  if (startPage > maxPages) return [];

  const first = await fetchProductSitemapWooPage(startPage);

  if (!first?.data?.length) return [];

  const all = [...first.data];
  const totalPages = Math.min(first.wpTotalPages ?? startPage, maxPages);
  const endPage = Math.min(startPage + wooPagesPerSitemap - 1, totalPages);

  for (let start = startPage + 1; start <= endPage; start += BATCH) {
    const end = Math.min(start + BATCH - 1, endPage);
    const batch = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) => fetchProductSitemapWooPage(start + i))
    );
    for (const res of batch) {
      if (res?.data?.length) all.push(...res.data);
    }
  }

  return all;
}
