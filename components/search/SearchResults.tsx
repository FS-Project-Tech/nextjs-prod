"use client";

import { useCallback, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SearchProductCard from "@/components/search/ProductCard";
import { MIN_SEARCH_LEN, useSearch } from "@/hooks/useSearch";
import { useProductListing } from "@/contexts/ProductListingContext";
import { LISTING_SORT_OPTIONS } from "@/lib/listing-sort-options";

function stripDeprecatedListingParams(params: URLSearchParams, pathname: string) {
  if (!pathname.startsWith("/search")) {
    params.delete("brand");
  }
  params.delete("minPrice");
  params.delete("maxPrice");
}

export default function SearchResults() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingCtx = useProductListing();
  const setListingBusyRef = useRef(listingCtx?.setListingBusy);
  setListingBusyRef.current = listingCtx?.setListingBusy;
  const setListingTotalRef = useRef(listingCtx?.setListingTotal);
  setListingTotalRef.current = listingCtx?.setListingTotal;

  const {
    results,
    loading,
    loadingMore,
    error,
    total,
    hasMore,
    loadMore,
    highlightQuery,
    setListingFilters,
    debouncedQuery,
    apiQuery,
  } = useSearch();

  const searchParamsKey = searchParams.toString();

  const filters = useMemo(() => {
    const params: Record<string, string> = {};
    const catQ = searchParams.get("categories")?.trim() || searchParams.get("category")?.trim();
    if (catQ) params.category_slug = catQ;

    const urlBrands = searchParams.get("brands")?.trim();
    if (urlBrands) params.brands = urlBrands;

    const sortBy = searchParams.get("sortBy");
    if (sortBy) params.sortBy = sortBy;

    const minP = searchParams.get("min_price") || searchParams.get("minPrice");
    const maxP = searchParams.get("max_price") || searchParams.get("maxPrice");
    if (minP && /^\d+(\.\d+)?$/.test(minP)) params.min_price = minP;
    if (maxP && /^\d+(\.\d+)?$/.test(maxP)) params.max_price = maxP;

    return params;
  }, [searchParamsKey]);

  useEffect(() => {
    setListingFilters(filters);
  }, [filters, setListingFilters]);

  useEffect(() => {
    setListingTotalRef.current?.(total);
  }, [total]);

  useEffect(() => {
    setListingBusyRef.current?.(loading);
  }, [loading]);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!observerTarget.current || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(observerTarget.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const listingBusy = Boolean(listingCtx?.listingBusy);
  const currentSort = searchParams.get("sortBy") || "popularity";

  const urlQ = (searchParams.get("q") || "").trim();
  const termForHeading =
    urlQ || (apiQuery && apiQuery !== "*" ? apiQuery : "");
  const resultsHeading = termForHeading
    ? `Search results for “${termForHeading}”`
    : "Search";

  const handleSortChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      if (listingBusy) return;
      const v = e.target.value;
      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedListingParams(params, pathname);
      if (v === "popularity") params.delete("sortBy");
      else params.set("sortBy", v);
      params.delete("page");
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      const cur = searchParams.toString() ? `${pathname}?${searchParams}` : pathname;
      if (next !== cur) router.replace(next, { scroll: false });
    },
    [listingBusy, pathname, router, searchParams]
  );

  const resultsMeta =
    total > 0 && results.length > 0 ? (
      <p className="text-sm text-gray-600">
        {results.length === total
          ? `${total} result${total === 1 ? "" : "s"}`
          : `Showing ${results.length} of ${total}`}
      </p>
    ) : null;

  const sortToolbar = (
    <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:gap-y-2">
      <div className="min-w-0 flex-1 text-left">
        <h2 className="text-lg font-semibold text-gray-900 lg:text-xl">{resultsHeading}</h2>
        {resultsMeta}
      </div>
      <label className="flex w-full shrink-0 flex-col gap-1 sm:w-auto sm:max-w-[16rem] sm:flex-row sm:items-center sm:gap-2">
        <span className="shrink-0 text-sm font-medium text-gray-700">Sort by</span>
        <select
          value={currentSort}
          disabled={listingBusy}
          onChange={handleSortChange}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:pointer-events-none disabled:opacity-50 sm:min-w-[12rem]"
        >
          {LISTING_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const shortInput =
    debouncedQuery.trim().length > 0 && debouncedQuery.trim().length < MIN_SEARCH_LEN;

  if (shortInput && apiQuery === "") {
    return (
      <div className="space-y-4">
        {sortToolbar}
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/80 px-6 py-10 text-center text-sm text-amber-950">
          Type at least {MIN_SEARCH_LEN} characters in the site search (header) to run a query here, or clear
          the search field to browse all products.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error}
        {error.includes("not configured") && (
          <p className="mt-2 text-xs text-amber-800">
            Set TYPESENSE_HOST and TYPESENSE_API_KEY (see lib/typesenseClient.ts).
          </p>
        )}
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="space-y-4">
        {sortToolbar}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="grid animate-pulse grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-1"
            >
              <div className="aspect-square rounded-lg bg-gray-200" />
              <div className="min-w-0 space-y-2">
                <div className="h-4 rounded bg-gray-200" />
                <div className="h-4 w-3/4 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!loading && results.length === 0) {
    return (
      <div className="space-y-4">
        {sortToolbar}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-12 text-center text-sm text-gray-600">
          No products match your search. Try different keywords or adjust filters.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortToolbar}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {results.map((product, index) => (
          <SearchProductCard
            key={`${product.docType}-${product.id}`}
            product={product}
            highlightQuery={highlightQuery}
            priority={index < 4}
          />
        ))}
      </div>
      {hasMore ? (
        <div ref={observerTarget} className="py-10 text-center">
          {loadingMore ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600" />
              <span className="text-xs text-gray-500">Loading more…</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
