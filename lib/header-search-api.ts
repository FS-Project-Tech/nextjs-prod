/**
 * Header instant search — same pipeline as `/api/typesense/search` (collection, query_by, facets, SKU logic).
 */

import { TS_FIELDS } from "@/lib/typesense-products";
import { isLikelySkuToken, parseSkuTokens } from "@/lib/sku-search-tokens";

export type HeaderSearchFacetCount = { value: string; count: number };
export type HeaderSearchFacetGroup = { field_name: string; counts: HeaderSearchFacetCount[] };

export type HeaderSearchApiResult = {
  hits: Array<{ document?: Record<string, unknown>; text_match?: number }>;
  facet_counts: HeaderSearchFacetGroup[];
  categories: HeaderSearchFacetCount[];
  brands: HeaderSearchFacetCount[];
};

/** Map API search row back to a Typesense-like document for {@link buildRankedFlatRows}. */
export function searchProductRowToPseudoDoc(p: Record<string, unknown>): Record<string, unknown> {
  const docType = String(p.docType || "parent").toLowerCase();
  const isVar = docType === "variation";
  const skuRaw = p.sku;
  const sku =
    Array.isArray(skuRaw) && skuRaw.length > 0
      ? String(skuRaw[0] ?? "").trim()
      : typeof skuRaw === "string"
        ? skuRaw.trim()
        : skuRaw != null
          ? String(skuRaw).trim()
          : "";

  const out: Record<string, unknown> = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku,
    image: p.image,
    price: p.price,
    regular_price: p.regular_price,
    sale_price: p.sale_price,
    type: isVar ? "variation" : "parent",
    attributes: p.attributes,
  };
  if (p.parentId != null && String(p.parentId).trim() !== "") {
    out.parent_id = p.parentId;
  }
  return out;
}

function pickFacetCounts(
  facet_counts: HeaderSearchFacetGroup[],
  fieldName: string
): HeaderSearchFacetCount[] {
  const g = facet_counts.find((f) => f.field_name === fieldName);
  return Array.isArray(g?.counts) ? g.counts : [];
}

/**
 * Runs header search via same Next route as listing/search page (env, CORS, query_by, facets).
 */
export async function fetchHeaderSearchSuggestions(
  queryTrimmed: string,
  signal: AbortSignal
): Promise<HeaderSearchApiResult> {
  const skuTokens = parseSkuTokens(queryTrimmed);
  const useSkuFilterSearch =
    skuTokens.length > 1 &&
    (/[,&;\n\r\t]/.test(queryTrimmed) || skuTokens.every((t) => isLikelySkuToken(t)));

  const formattedQuery = queryTrimmed
    .split(/[,\/&\s]+/)
    .map((q) => q.trim())
    .filter(Boolean)
    .join(" || ");

  /** API parses SKU tokens from raw `q`; OR-query uses formatted string for keyword search. */
  const qParam = useSkuFilterSearch
    ? queryTrimmed
    : formattedQuery.trim() || queryTrimmed;

  const usp = new URLSearchParams();
  usp.set("q", qParam);
  usp.set("per_page", "10");
  usp.set("page", "1");
  usp.set("include_facets", "1");
  usp.set("search_ui", "1");

  const res = await fetch(`/api/typesense/search?${usp.toString()}`, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });

  const text = (await res.text()).replace(/^\uFEFF/, "").trim();
  let json: {
    products?: Record<string, unknown>[];
    facet_counts?: HeaderSearchFacetGroup[];
    error?: string;
    message?: string;
  };
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    throw new Error("Invalid search response.");
  }

  if (!res.ok) {
    const msg =
      typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : typeof json.message === "string" && json.message.trim()
          ? json.message.trim()
          : `Search failed (${res.status})`;
    throw new Error(msg);
  }

  const products = Array.isArray(json.products) ? json.products : [];
  const facet_counts = Array.isArray(json.facet_counts) ? json.facet_counts : [];

  const hits = products.map((p) => ({
    document: searchProductRowToPseudoDoc(p),
    text_match: 0,
  }));

  const categories = pickFacetCounts(facet_counts, TS_FIELDS.categorySlug);
  const brands = pickFacetCounts(facet_counts, TS_FIELDS.brandSlug);

  return { hits, facet_counts, categories, brands };
}
