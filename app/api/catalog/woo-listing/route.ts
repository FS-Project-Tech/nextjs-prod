import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/woocommerce";
import { wooProductToListingCard } from "@/lib/woo-listing-mapper";
import { dedupeProductsById } from "@/lib/utils/product";
import { API_RATE_LIMITS, rateLimit } from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { parseListingSortQueryValue } from "@/lib/listing-sort-options";

export const runtime = "nodejs";

function sanitizeSlug(input: string | null, max = 200): string {
  if (!input) return "";
  return input
    .replace(/[<>'"`;\\]/g, "")
    .replace(/\.\./g, "")
    .trim()
    .slice(0, max);
}

function parseBrands(raw: string | null): string {
  const parts = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.join(",");
}

function isPublishedStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !s || s === "publish" || s === "published";
}

/**
 * Shop/category/brand/clearance product **documents** from WooCommerce REST.
 * Sidebar facets continue to use `GET /api/typesense/search?facets_only=1` (unchanged).
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const limit = await rateLimit(API_RATE_LIMITS.PRODUCTS_READ)(request);
    if (limit) return limit;

    const sp = request.nextUrl.searchParams;
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get("per_page") || "24", 10) || 24));
    const page = Math.min(500, Math.max(1, parseInt(sp.get("page") || "1", 10) || 1));

    const categorySlug = sanitizeSlug(sp.get("category_slug") || sp.get("categorySlug"));
    const tagSlug = sanitizeSlug(sp.get("tag_slug") || sp.get("tagSlug") || sp.get("tag"));
    const brandSingle = sanitizeSlug(sp.get("brand_slug") || sp.get("brandSlug"));
    const brandsParam = parseBrands(sp.get("brands"));
    const brands =
      brandsParam ||
      (brandSingle ? brandSingle : "");

    const minPrice = sp.get("min_price") || sp.get("minPrice") || "";
    const maxPrice = sp.get("max_price") || sp.get("maxPrice") || "";

    const onSaleOnly = sp.get("on_sale") === "true";

    const qRaw = sp.get("q") || sp.get("search") || sp.get("query") || sp.get("Search") || "";
    const qTrim = qRaw.trim();
    const search =
      qTrim && qTrim !== "*" ? qTrim.slice(0, 200) : undefined;

    const sortBy =
      parseListingSortQueryValue(sp.get("sortBy")) ||
      parseListingSortQueryValue(sp.get("sort")) ||
      undefined;

    const result = await fetchProducts({
      page,
      per_page: perPage,
      categorySlug: categorySlug || undefined,
      tagSlug: tagSlug || undefined,
      brands: brands || undefined,
      minPrice: /^\d+(\.\d+)?$/.test(minPrice) ? minPrice : undefined,
      maxPrice: /^\d+(\.\d+)?$/.test(maxPrice) ? maxPrice : undefined,
      sortBy: sortBy || undefined,
      search,
      on_sale: onSaleOnly ? true : undefined,
      status: "publish",
    });

    const raw = Array.isArray(result.products)
      ? result.products.filter((p) => isPublishedStatus(p.status))
      : [];
    const products = dedupeProductsById(raw.map(wooProductToListingCard));

    return withRequestId(
      NextResponse.json(
        {
          products,
          total: result.total,
          totalPages: result.totalPages,
          page: result.page,
          per_page: result.perPage,
          facet_counts: [],
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
          },
        },
      ),
      requestId,
    );
  } catch (e) {
    console.error("[api/catalog/woo-listing]", { requestId, error: e });
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: e instanceof Error ? e.message : "WooCommerce listing failed",
      fallbackBody: {
        products: [],
        total: 0,
        totalPages: 0,
        facet_counts: [],
      },
      logPrefix: "api/catalog/woo-listing",
    });
  }
}
