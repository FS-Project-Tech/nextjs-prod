import { NextRequest, NextResponse } from "next/server";
import {
  getTypesenseClient,
  getTypesenseCollectionName,
  isTypesenseConfigured,
} from "@/lib/typesenseClient";
import {
  buildTypesenseFilterParts,
  dedupeProductsById,
  getTypesenseFacetBy,
  mapSortToTypesense,
  TS_FIELDS,
  TYPESENSE_DEFAULT_QUERY_BY,
  typesenseHitToListingProduct,
  typesenseHitToSearchProduct,
} from "@/lib/typesense-products";
import { parseListingSortQueryValue } from "@/lib/listing-sort-options";
import {
  isExactSkuSearchQuery,
  isLikelySkuToken,
  MAX_SKU_SEARCH_QUERY_LEN,
  parseSkuTokens,
  toTypesenseExactArray,
} from "@/lib/sku-search-tokens";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

// const inStockOnly = sp.get("in_stock_only") !== "0";

function sanitizeSlug(input: string | null, max = 200): string {
  if (!input) return "";
  return input
    .replace(/[<>'"`;\\]/g, "")
    .replace(/\.\./g, "")
    .trim()
    .slice(0, max);
}

function parseBrands(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const s = sanitizeSlug(part, 120);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Allow only safe Typesense field names for `group_by`. */
function sanitizeGroupByField(raw: string | null): string {
  if (!raw?.trim()) return "";
  const s = raw.trim().slice(0, 64);
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) ? s : "";
}

type TypesenseHitLike = { document?: Record<string, unknown> };

type SearchUiProductLike = {
  id?: unknown;
  sku?: unknown;
  docType?: unknown;
  variation_id?: unknown;
};

/** After TS mapping: keep only rows whose `sku` was explicitly requested (avoids grouped parent rows). */
function filterByRequestedSkuTokens<T extends { sku?: string }>(items: T[], tokens: string[]): T[] {
  const want = new Set(tokens.map((t) => t.trim().toUpperCase()).filter(Boolean));
  if (want.size === 0) return items;
  return items.filter((p) => {
    const s = String(p.sku ?? "").trim().toUpperCase();
    return Boolean(s) && want.has(s);
  });
}

function dedupeSearchProductsBySku<T extends SearchUiProductLike>(items: T[]): T[] {
  const out: T[] = [];
  const bySku = new Map<string, number>();
  const byId = new Set<number>();

  const rank = (p: T): number => {
    const docType = String(p.docType || "").toLowerCase();
    // Prefer concrete variation rows over generic parent rows for exact SKU searches.
    if (docType === "variation") return 2;
    if (Number(p.variation_id ?? 0) > 0) return 2;
    if (docType === "parent") return 1;
    return 0;
  };

  for (const item of items) {
    const id = Number(item?.id ?? 0);
    if (Number.isFinite(id) && id > 0) {
      if (byId.has(id)) continue;
      byId.add(id);
    }

    const sku = String(item?.sku ?? "")
      .trim()
      .toUpperCase();
    if (!sku) {
      out.push(item);
      continue;
    }

    const existingIdx = bySku.get(sku);
    if (existingIdx == null) {
      bySku.set(sku, out.length);
      out.push(item);
      continue;
    }

    const existing = out[existingIdx];
    if (rank(item) > rank(existing)) {
      out[existingIdx] = item;
    }
  }

  return out;
}

function flattenTypesenseHits(result: {
  hits?: TypesenseHitLike[];
  grouped_hits?: { hits?: TypesenseHitLike[] }[];
}): TypesenseHitLike[] {
  const groups = result.grouped_hits;
  if (groups && groups.length > 0) {
    const out: TypesenseHitLike[] = [];
    for (const g of groups) {
      for (const h of g.hits || []) out.push(h);
    }
    return out;
  }
  return result.hits || [];
}

function isPublishedStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !s || s === "publish" || s === "published";
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  if (!isTypesenseConfigured()) {
    return withRequestId(
      NextResponse.json(
      {
        error: "Typesense not configured",
        products: [],
        total: 0,
        totalPages: 0,
        facet_counts: [],
      },
      { status: 503 }
    ),
    requestId
    );
  }

  try {
    const sp = request.nextUrl.searchParams;
    const facetsOnly = sp.get("facets_only") === "1";
    const forBrandFacets = sp.get("for_brand_facets") === "1";
    /** Category facet counts for current brand + price/sale filters; omit category filter so all buckets appear. */
    const forBrandCategoryFacets = sp.get("for_brand_category_facets") === "1";
    /** Category facets for on-sale / discounted catalogue only; omit category filter. */
    const forOnSaleCategoryFacets = sp.get("for_on_sale_category_facets") === "1";
    if (forBrandCategoryFacets && !sanitizeSlug(sp.get("brand_slug") || sp.get("brandSlug"))) {
      return withRequestId(
        NextResponse.json(
        {
          error: "for_brand_category_facets requires brand_slug",
          products: [],
          total: 0,
          totalPages: 0,
          facet_counts: [],
        },
        { status: 400 }
      ),
      requestId
      );
    }
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get("per_page") || "24", 10) || 24));
    const page = Math.min(500, Math.max(1, parseInt(sp.get("page") || "1", 10) || 1));

    const categorySlugRaw = sanitizeSlug(sp.get("category_slug") || sp.get("categorySlug"));
    const categorySlug =
      forBrandCategoryFacets || forOnSaleCategoryFacets ? "" : categorySlugRaw;
    const brandSingle = sanitizeSlug(sp.get("brand_slug") || sp.get("brandSlug"));
    const brands = forBrandFacets ? [] : parseBrands(sp.get("brands"));

    const minPrice = sp.get("min_price") || sp.get("minPrice") || "";
    const maxPrice = sp.get("max_price") || sp.get("maxPrice") || "";

    const onSaleOnly = sp.get("on_sale") === "true" || forOnSaleCategoryFacets;

    const qRaw = sp.get("q") || sp.get("search") || sp.get("query") || sp.get("Search") || "";
    const qSanitized = sanitizeSlug(qRaw, MAX_SKU_SEARCH_QUERY_LEN);
    /** Parse from raw-length string so long comma lists are not truncated at 200 chars. */
    const skuTokens = parseSkuTokens(String(qRaw || "").trim().slice(0, MAX_SKU_SEARCH_QUERY_LEN));
    const useSkuFilterSearch = isExactSkuSearchQuery(qRaw, skuTokens);
    const useSkuPrefixDedupe =
      !useSkuFilterSearch &&
      skuTokens.length === 1 &&
      isLikelySkuToken(skuTokens[0]) &&
      /[\d._/-]/.test(skuTokens[0]);
    const useSkuResultDedupe = useSkuFilterSearch || useSkuPrefixDedupe;
    const q = useSkuFilterSearch ? "*" : qSanitized || "*";

    /** Fetch enough TS rows per page so parent + variation docs for each SKU usually fit (multi-SKU paste). */
    const typesensePerPage =
      facetsOnly || !useSkuFilterSearch
        ? perPage
        : Math.min(250, Math.max(perPage, skuTokens.length * 25, 48));
    const explicitSort =
      parseListingSortQueryValue(sp.get("sortBy")) ||
      parseListingSortQueryValue(sp.get("sort"));
    /** Keyword search: relevance first. Browse (`*`): popularity (or price fallback in mapSort). */
    const sortBy =
      explicitSort ?? (q !== "*" ? "relevance" : "popularity");

    const filterParts = buildTypesenseFilterParts({
      categorySlug: categorySlug || null,
      brandSlugs: brands,
      brandSlugSingle: brandSingle || null,
      minPrice: /^\d+(\.\d+)?$/.test(minPrice) ? minPrice : null,
      maxPrice: /^\d+(\.\d+)?$/.test(maxPrice) ? maxPrice : null,
      onSaleOnly,
    });

    const skuFilter = useSkuFilterSearch ? `sku:=${toTypesenseExactArray(skuTokens)}` : "";
    const filter_by = [...filterParts, ...(skuFilter ? [skuFilter] : [])].join(" && ");
    const sort_by = mapSortToTypesense(sortBy);

    const client = getTypesenseClient();
    const collection = getTypesenseCollectionName();

    const groupByParam = sanitizeGroupByField(sp.get("group_by"));
    const groupLimitRaw = parseInt(sp.get("group_limit") || "10", 10);
    const groupLimit = Math.min(50, Math.max(1, Number.isFinite(groupLimitRaw) ? groupLimitRaw : 10));

    // Typesense requires per_page >= 1; use 1 for facet-only to minimize payload.
    const searchParams: Record<string, unknown> = {
      q,
      query_by: useSkuFilterSearch
        ? "name,sku"
        : (process.env.TYPESENSE_QUERY_BY || "").trim() || TYPESENSE_DEFAULT_QUERY_BY,
      per_page: facetsOnly ? 1 : typesensePerPage,
      page: facetsOnly ? 1 : page,
      sort_by,
    };

    if (filter_by) searchParams.filter_by = filter_by;

    /** Grouped search bundles extra docs per group (e.g. parent + variations) — breaks exact multi-SKU paste. */
    if (groupByParam && !facetsOnly && !useSkuFilterSearch) {
      searchParams.group_by = groupByParam;
      searchParams.group_limit = groupLimit;
    }

    if (facetsOnly || sp.get("include_facets") === "1") {
      searchParams.facet_by =
        forBrandCategoryFacets || forOnSaleCategoryFacets
          ? TS_FIELDS.categorySlug
          : getTypesenseFacetBy();
      searchParams.max_facet_values = Math.min(
        forOnSaleCategoryFacets ? 250 : 100,
        parseInt(sp.get("max_facet_values") || (forOnSaleCategoryFacets ? "200" : "50"), 10) ||
          (forOnSaleCategoryFacets ? 200 : 50)
      );
    }

    const result = await client
      .collections(collection)
      .documents()
      .search(searchParams as Record<string, unknown>);

    const found = result.found ?? 0;

    const hits = flattenTypesenseHits(result as Parameters<typeof flattenTypesenseHits>[0]).filter(
      (h) => isPublishedStatus((h.document || {}).status)
    );
    const useSearchShape = sp.get("search_ui") === "1";
    const products = useSearchShape
      ? (() => {
          const mapped = hits.map((h) =>
            typesenseHitToSearchProduct((h.document || {}) as Record<string, unknown>)
          );
          if (!useSkuResultDedupe) return mapped;
          const deduped = dedupeSearchProductsBySku(mapped);
          return useSkuFilterSearch ? filterByRequestedSkuTokens(deduped, skuTokens) : deduped;
        })()
      : (() => {
          const listed = dedupeProductsById(
            hits.map((h) =>
              typesenseHitToListingProduct((h.document || {}) as Record<string, unknown>)
            )
          );
          if (!useSkuResultDedupe) return listed;
          const deduped = dedupeSearchProductsBySku(listed);
          return useSkuFilterSearch ? filterByRequestedSkuTokens(deduped, skuTokens) : deduped;
        })();

    /**
     * Raw `found` counts Typesense documents (parents + variations). After dedupe the UI list is shorter,
     * which caused "Showing 2 of 6". When this response includes all TS hits for the query, expose counts
     * that match `products.length`.
     */
    const allSkuHitsInOnePage =
      !facetsOnly && useSkuResultDedupe && page === 1 && found <= typesensePerPage;
    const responseTotal =
      allSkuHitsInOnePage && !facetsOnly ? products.length : found;
    const responseTotalPages = facetsOnly
      ? 1
      : Math.max(1, Math.ceil(responseTotal / perPage));

    return withRequestId(
      NextResponse.json(
        {
          products,
          total: responseTotal,
          totalPages: responseTotalPages,
          page: facetsOnly ? 1 : page,
          per_page: facetsOnly ? 1 : perPage,
          facet_counts: result.facet_counts || [],
        },
        {
          headers: {
            // Prices come from Typesense snapshots — avoid shared CDN cache so header/listing
            // search does not lag behind Woo after a sync (was public s-maxage=30).
            "Cache-Control": "private, no-store, must-revalidate",
          },
        }
      ),
      requestId
    );
  } catch (e) {
    console.error("[api/typesense/search]", { requestId, error: e });
    const msg = e instanceof Error ? e.message : "Typesense search failed";
    const schemaHint = /filter field|facet field|Could not find.*field/i.test(msg)
      ? "Your Typesense collection fields differ from defaults. Set TYPESENSE_FIELD_CATEGORY_SLUG, TYPESENSE_FIELD_BRAND_SLUG, and TYPESENSE_FACET_BY (or run `node scripts/typesense-list-fields.mjs`) to match the schema."
      : undefined;
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: msg,
      fallbackBody: {
        hint: schemaHint,
        products: [],
        total: 0,
        totalPages: 0,
        facet_counts: [],
      },
      logPrefix: "api/typesense/search",
    });
  }
}
