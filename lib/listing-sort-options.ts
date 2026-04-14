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

type SearchParamsLike = { get(name: string): string | null } | null;

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
