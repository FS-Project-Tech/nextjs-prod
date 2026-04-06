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
  typesenseHitToListingProduct,
} from "@/lib/typesense-products";

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

export async function GET(request: NextRequest) {
  if (!isTypesenseConfigured()) {
    return NextResponse.json(
      {
        error: "Typesense not configured",
        products: [],
        total: 0,
        totalPages: 0,
        facet_counts: [],
      },
      { status: 503 }
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
      return NextResponse.json(
        {
          error: "for_brand_category_facets requires brand_slug",
          products: [],
          total: 0,
          totalPages: 0,
          facet_counts: [],
        },
        { status: 400 }
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

    const sortBy = sp.get("sortBy") || sp.get("sort") || "popularity";
    const qRaw = sp.get("q") || sp.get("search") || sp.get("query") || sp.get("Search") || "";
    const q = sanitizeSlug(qRaw, 200) || "*";

    const filterParts = buildTypesenseFilterParts({
      categorySlug: categorySlug || null,
      brandSlugs: brands,
      brandSlugSingle: brandSingle || null,
      minPrice: /^\d+(\.\d+)?$/.test(minPrice) ? minPrice : null,
      maxPrice: /^\d+(\.\d+)?$/.test(maxPrice) ? maxPrice : null,
      onSaleOnly,
    });

    const filter_by = filterParts.length ? filterParts.join(" && ") : "";
    const sort_by = mapSortToTypesense(sortBy);

    const client = getTypesenseClient();
    const collection = getTypesenseCollectionName();

    // Typesense requires per_page >= 1; use 1 for facet-only to minimize payload.
    const searchParams: Record<string, unknown> = {
      q,
      query_by: process.env.TYPESENSE_QUERY_BY || "name,description",
      per_page: facetsOnly ? 1 : perPage,
      page: facetsOnly ? 1 : page,
      sort_by,
    };

    if (filter_by) searchParams.filter_by = filter_by;

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
    const totalPages = facetsOnly ? 1 : Math.max(1, Math.ceil(found / perPage));

    const products = dedupeProductsById(
      (result.hits || []).map((h) =>
        typesenseHitToListingProduct((h.document || {}) as Record<string, unknown>)
      )
    );

    return NextResponse.json(
      {
        products,
        total: found,
        totalPages,
        page: facetsOnly ? 1 : page,
        per_page: facetsOnly ? 1 : perPage,
        facet_counts: result.facet_counts || [],
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    console.error("[api/typesense/search]", e);
    const msg = e instanceof Error ? e.message : "Typesense search failed";
    const schemaHint = /filter field|facet field|Could not find.*field/i.test(msg)
      ? "Your Typesense collection fields differ from defaults. Set TYPESENSE_FIELD_CATEGORY_SLUG, TYPESENSE_FIELD_BRAND_SLUG, and TYPESENSE_FACET_BY (or run `node scripts/typesense-list-fields.mjs`) to match the schema."
      : undefined;
    return NextResponse.json(
      {
        error: msg,
        hint: schemaHint,
        products: [],
        total: 0,
        totalPages: 0,
        facet_counts: [],
      },
      { status: 500 }
    );
  }
}
