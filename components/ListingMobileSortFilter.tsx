"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProductListing } from "@/contexts/ProductListingContext";
import { LISTING_SORT_OPTIONS } from "@/lib/listing-sort-options";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";

const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false,
});

function stripDeprecatedListingParams(params: URLSearchParams) {
  params.delete("brand");
  params.delete("minPrice");
  params.delete("maxPrice");
}

function useActiveFilterCount() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    if (!searchParams) return 0;
    let count = 0;
    const brands = searchParams.get("brands");
    if (brands) count += brands.split(",").filter(Boolean).length;
    if (
      searchParams.get("min_price") ||
      searchParams.get("max_price") ||
      searchParams.get("minPrice") ||
      searchParams.get("maxPrice")
    ) {
      count += 1;
    }
    return count;
  }, [searchParams]);
}

export type ListingMobileSortFilterProps = {
  categorySlug?: string;
  brandSlug?: string;
  onSaleOnly?: boolean;
};

/**
 * Sticky bar (lg:hidden): Sort | Filter — e-commerce mobile pattern.
 * - Sort: bottom sheet with radios (same behaviour as desktop ProductGrid select).
 * - Filter: full-screen panel with existing FilterSidebar (no logic change).
 */
export default function ListingMobileSortFilter({
  categorySlug,
  brandSlug,
  onSaleOnly,
}: ListingMobileSortFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listingCtx = useProductListing();
  const filtersLocked = Boolean(listingCtx?.listingBusy);
  const filterBadge = useActiveFilterCount();

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (sortOpen || filterOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sortOpen, filterOpen]);

  const currentSort = searchParams?.get("sortBy") || "popularity";

  const applySort = useCallback(
    (value: string) => {
      if (filtersLocked || !searchParams) return;
      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedListingParams(params);
      if (value === "popularity") params.delete("sortBy");
      else params.set("sortBy", value);
      params.delete("page");
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      const cur = searchParams.toString()
        ? `${pathname}?${searchParams}`
        : pathname;
      if (next !== cur) router.replace(next, { scroll: false });
      setSortOpen(false);
    },
    [filtersLocked, pathname, router, searchParams]
  );

  return (
    <>
      <div className="lg:hidden sticky top-[72px] z-40 -mx-4 px-4 py-3 bg-white/95 backdrop-blur-sm border-b border-gray-200 mb-4 shadow-sm">
        <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => {
              setFilterOpen(false);
              setSortOpen(true);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200/80 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-expanded={sortOpen}
          >
            <svg className="h-5 w-5 shrink-0 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" />
            </svg>
            Sort
          </button>
          <button
            type="button"
            onClick={() => {
              setSortOpen(false);
              setFilterOpen(true);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200/80 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-expanded={filterOpen}
          >
            <svg className="h-5 w-5 shrink-0 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filter
            {filterBadge > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1 text-xs font-bold text-white">
                {filterBadge}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sort bottom sheet */}
      {sortOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Sort products">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close sort"
            onClick={() => setSortOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] animate-in slide-in-from-bottom duration-200 rounded-t-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-4 pb-3 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sort by</p>
            </div>
            <ul className="max-h-[65vh] overflow-y-auto px-2 py-2">
              {LISTING_SORT_OPTIONS.map((o) => {
                const selected = currentSort === o.value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      disabled={filtersLocked}
                      onClick={() => applySort(o.value)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-left text-base text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span>{o.label}</span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected ? "border-teal-600 bg-teal-600" : "border-gray-300"
                        }`}
                        aria-hidden
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setSortOpen(false)}
                className="w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter full screen */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filter products"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-3 py-3">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Back"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-24">
            <FilterSidebar
              categorySlug={categorySlug}
              brandSlug={brandSlug}
              onSaleOnly={onSaleOnly}
              isMobileDrawer
              mobileFullscreen
              onClose={() => setFilterOpen(false)}
            />
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="w-full rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
    </>
  );
}
