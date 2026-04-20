/** Shared with ProductGrid and mobile sort sheet — keep labels in sync with `sortBy` URL param. */
export const LISTING_SORT_OPTIONS = [
  { value: "relevance", label: "Best match" },
  { value: "popularity", label: "Popularity" },
  { value: "price_low", label: "Price — Low to High" },
  { value: "price_high", label: "Price — High to Low" },
  { value: "newest", label: "Newest First" },
  { value: "rating", label: "Rating" },
] as const;

export type ListingSortValue = (typeof LISTING_SORT_OPTIONS)[number]["value"];

/** Valid `sortBy` query values (URL + API). */
export const LISTING_SORT_VALUES = new Set<string>(
  LISTING_SORT_OPTIONS.map((o) => o.value),
);

type SearchParamsLike = { get(name: string): string | null } | null;

/** Returns a known sort token or null (ignore typos / legacy Woo `sortBy=date` etc.). */
export function parseListingSortQueryValue(
  raw: string | null | undefined,
): ListingSortValue | null {
  const v = raw?.trim();
  if (!v || !LISTING_SORT_VALUES.has(v)) return null;
  return v as ListingSortValue;
}

/**
 * Maps legacy WooCommerce-style `orderby` + `order` query params to our `sortBy` values when `sortBy` is absent.
 * Keeps old links like `/shop?orderby=date&order=desc` working alongside `/shop?sortBy=newest`.
 */
export function resolveListingSortFromUrl(searchParams: SearchParamsLike): string | null {
  const explicit = parseListingSortQueryValue(searchParams?.get("sortBy"));
  if (explicit) return explicit;

  const orderby = searchParams?.get("orderby")?.trim().toLowerCase();
  if (!orderby) return null;

  const order = (searchParams?.get("order")?.trim().toLowerCase()) || "desc";

  switch (orderby) {
    case "date":
      return order === "asc" ? null : "newest";
    case "popularity":
      return "popularity";
    case "price":
      return order === "asc" ? "price_low" : "price_high";
    case "rating":
      return "rating";
    default:
      return null;
  }
}

/**
 * When `sortBy` is omitted from the URL, the UI assumes this value (must match API defaults per path).
 * Any keyword in the listing query string matches `/api/typesense/search` default (`q` ≠ `*` → relevance).
 */
export function defaultListingSort(_pathname: string, searchParams: SearchParamsLike): ListingSortValue {
  const keyword =
    searchParams?.get("q")?.trim() ||
    searchParams?.get("search")?.trim() ||
    searchParams?.get("query")?.trim() ||
    searchParams?.get("Search")?.trim();
  if (keyword) return "relevance";
  return "popularity";
}

/** If true, remove `sortBy` from the query string (canonical URL for the default sort on this page). */
export function shouldOmitSortParam(
  pathname: string,
  searchParams: SearchParamsLike,
  selected: string
): boolean {
  return selected === defaultListingSort(pathname, searchParams);
}
