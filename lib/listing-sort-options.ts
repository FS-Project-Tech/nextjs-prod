/** Shared with ProductGrid and mobile sort sheet — keep labels in sync with `sortBy` URL param. */
export const LISTING_SORT_OPTIONS = [
    { value: "popularity", label: "Popularity" },
    { value: "price_low", label: "Price: Low to high" },
    { value: "price_high", label: "Price: High to low" },
    { value: "newest", label: "Newest" },
    { value: "rating", label: "Rating" },
  ] as const;
  
  export type ListingSortValue = (typeof LISTING_SORT_OPTIONS)[number]["value"];
  