"use client";

import { useEffect, useRef, useMemo, useReducer, useCallback, type ChangeEvent } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { ProductCardProduct } from "@/lib/types/product";
import { getSalePercentageFromProduct } from "@/lib/utils/product";
import { useProductListing } from "@/contexts/ProductListingContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { LISTING_SORT_OPTIONS } from "@/lib/listing-sort-options";

interface ProductGridProps {
  categorySlug?: string;
  brandSlug?: string;
  onSaleOnly?: boolean;
  products?: ProductCardProduct[];
}

interface GridState {
  products: ProductCardProduct[];
  loading: boolean;
  error: string | null;
  page: number;
  total: number;
  hasMore: boolean;
  isInitialLoad: boolean;
}

type GridAction =
  | { type: "FETCH_START"; isInitial?: boolean }
  | {
      type: "FETCH_SUCCESS";
      products: ProductCardProduct[];
      total: number;
      totalPages: number;
      append: boolean;
      pageNum: number;
    }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "LOAD_MORE" }
  | { type: "RESET" };

const initialState: GridState = {
  products: [],
  loading: true,
  error: null,
  page: 1,
  total: 0,
  hasMore: true,
  isInitialLoad: true,
};

function dedupeProductsById(items: ProductCardProduct[]): ProductCardProduct[] {
  const seen = new Set<number>();
  const out: ProductCardProduct[] = [];
  for (const item of items) {
    const id = Number(item.id || 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...state,
        loading: true,
        error: null,
        isInitialLoad: action.isInitial ?? state.isInitialLoad,
      };
    case "FETCH_SUCCESS":
      const merged = action.append ? [...state.products, ...action.products] : action.products;
      return {
        ...state,
        products: dedupeProductsById(merged),
        total: action.total,
        hasMore: action.pageNum < action.totalPages,
        loading: false,
        isInitialLoad: false,
      };
    case "FETCH_ERROR":
      return {
        ...state,
        error: action.error,
        loading: false,
        isInitialLoad: false,
      };
    case "LOAD_MORE":
      return { ...state, page: state.page + 1 };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

function categoryLeafFromPathname(pathname: string): string {
  if (!pathname.startsWith("/product-category/")) return "";
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1]! : "";
}

const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "price_low", label: "Price: Low to high" },
  { value: "price_high", label: "Price: High to low" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Rating" },
] as const;

function stripDeprecatedListingParams(params: URLSearchParams, pathname: string) {
  if (!pathname.startsWith("/search")) {
    params.delete("brand");
  }
  params.delete("minPrice");
  params.delete("maxPrice");
}

export default function ProductGrid({ categorySlug, brandSlug, onSaleOnly }: ProductGridProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingCtx = useProductListing();
  const setListingBusyRef = useRef(listingCtx?.setListingBusy);
  setListingBusyRef.current = listingCtx?.setListingBusy;
  const setListingTotalRef = useRef(listingCtx?.setListingTotal);
  setListingTotalRef.current = listingCtx?.setListingTotal;

  const [state, dispatch] = useReducer(gridReducer, initialState);
  const observerTarget = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const listingBusyGenerationRef = useRef(0);

  const searchParamsKey = searchParams.toString();

  const categoryFromPath = useMemo(() => categoryLeafFromPathname(pathname), [pathname]);

  const effectiveCategorySlug = categorySlug || categoryFromPath || "";

  const filters = useMemo<Record<string, string>>(() => {
    const params: Record<string, string> = {};

    if (effectiveCategorySlug) {
      params.category_slug = effectiveCategorySlug;
    } else {
      const catQ = searchParams.get("categories")?.trim() || searchParams.get("category")?.trim();
      if (catQ) params.category_slug = catQ;
    }

    const urlBrands = searchParams.get("brands")?.trim();
    if (!brandSlug && urlBrands) params.brands = urlBrands;

    const sortBy = searchParams.get("sortBy");
    if (sortBy) params.sortBy = sortBy;

    const minP = searchParams.get("min_price") || searchParams.get("minPrice");
    const maxP = searchParams.get("max_price") || searchParams.get("maxPrice");
    if (minP && /^\d+(\.\d+)?$/.test(minP)) params.min_price = minP;
    if (maxP && /^\d+(\.\d+)?$/.test(maxP)) params.max_price = maxP;

    const searchQ =
      searchParams.get("q")?.trim() ||
      searchParams.get("search")?.trim() ||
      searchParams.get("query")?.trim() ||
      searchParams.get("Search")?.trim();
    if (searchQ) params.q = searchQ.slice(0, 100);

    return params;
  }, [effectiveCategorySlug, brandSlug, searchParamsKey]);

  const debouncedQuery = useDebouncedValue(filters.q || "", 400);
  const effectiveFilters = useMemo<Record<string, string>>(
    () => ({
      ...filters,
      q: pathname.startsWith("/search") ? filters.q || "" : debouncedQuery,
    }),
    [filters, debouncedQuery, pathname]
  );

  const fetchProducts = useCallback(
    async (pageNum: number, append = false) => {
      if (abortControllerRef.current) abortControllerRef.current.abort();

      const fetchId = ++fetchIdRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: "FETCH_START", isInitial: pageNum === 1 && !append });
      let listingBusyGen = 0;
      if (pageNum === 1 && !append) {
        listingBusyGen = ++listingBusyGenerationRef.current;
        setListingBusyRef.current?.(true);
      }

      try {
        const usp = new URLSearchParams();
        usp.set("page", String(pageNum));
        usp.set("per_page", "24");
        usp.set("include_facets", "0");

        if (effectiveFilters.category_slug) {
          usp.set("category_slug", effectiveFilters.category_slug);
        }
        if (brandSlug) {
          usp.set("brand_slug", brandSlug);
        }
        if (effectiveFilters.brands) {
          usp.set("brands", effectiveFilters.brands);
        } else {
          const singleBrand = searchParams.get("brand")?.trim();
          if (!brandSlug && singleBrand) {
            usp.set("brand_slug", singleBrand);
          }
        }
        if (effectiveFilters.sortBy) usp.set("sortBy", effectiveFilters.sortBy);
        if (effectiveFilters.min_price) usp.set("min_price", effectiveFilters.min_price);
        if (effectiveFilters.max_price) usp.set("max_price", effectiveFilters.max_price);
        const qOut = effectiveFilters.q?.trim();
        if (qOut) {
          usp.set("q", qOut);
        } else if (pathname.startsWith("/search")) {
          usp.set("q", "*");
        }
        if (onSaleOnly) usp.set("on_sale", "true");

        const res = await fetch(`/api/typesense/search?${usp.toString()}`, {
          signal: controller.signal,
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || res.statusText || "Search failed");
        }

        if (fetchId !== fetchIdRef.current) return;

        const raw = Array.isArray(json.products) ? json.products : [];
        const products: ProductCardProduct[] = raw.map(
          (p: Record<string, unknown>) =>
            ({
              id: p.id as number,
              name: String(p.name ?? ""),
              slug: String(p.slug ?? ""),
              sku: (p.sku as string) ?? "",
              price: String(p.price ?? "0"),
              sale_price: (p.sale_price as string) ?? "",
              regular_price: String(p.regular_price ?? ""),
              on_sale: Boolean(p.on_sale),
              sale_percentage: (p.sale_percentage as number) ?? null,
              image: String((p as { image?: string }).image ?? ""),
              images: Array.isArray(p.images)
                ? (p.images as { src: string; alt?: string }[])
                : (p as { image?: string }).image
                  ? [{ src: String((p as { image?: string }).image), alt: String(p.name) }]
                  : [],
              average_rating: String(p.average_rating ?? "0"),
              rating_count: Number(p.rating_count ?? 0),
              tax_class: p.tax_class as string | undefined,
              tax_status: p.tax_status as string | undefined,
            }) as ProductCardProduct
        );

        const totalHits = json.total || 0;
        if (pageNum === 1 && !append) {
          setListingTotalRef.current?.(totalHits);
        }
        dispatch({
          type: "FETCH_SUCCESS",
          products,
          total: totalHits,
          totalPages: json.totalPages || 1,
          append,
          pageNum,
        });
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        dispatch({
          type: "FETCH_ERROR",
          error: err instanceof Error ? err.message : "Failed to load",
        });
      } finally {
        if (
          pageNum === 1 &&
          !append &&
          listingBusyGen > 0 &&
          listingBusyGen === listingBusyGenerationRef.current
        ) {
          setListingBusyRef.current?.(false);
        }
      }
    },
    [effectiveFilters, brandSlug, searchParamsKey, onSaleOnly, pathname, searchParams]
  );

  useEffect(() => {
    dispatch({ type: "RESET" });
    fetchProducts(1);
  }, [fetchProducts]);

  useEffect(() => {
    if (!observerTarget.current || !state.hasMore || state.loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          dispatch({ type: "LOAD_MORE" });
          fetchProducts(state.page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [state.hasMore, state.loading, state.page, fetchProducts]);

  const listingBusy = Boolean(listingCtx?.listingBusy);
  const currentSort = searchParams.get("sortBy") || "popularity";

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

  const sortToolbar = (
    <div className="hidden lg:flex flex-col gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-center sm:justify-end">
      <label className="flex w-full flex-col gap-1 sm:ms-auto sm:w-auto sm:max-w-[16rem] sm:flex-row sm:items-center sm:gap-2">
        <span className="text-sm font-medium text-gray-700 shrink-0">Sort by</span>
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

  return (
    <div className="space-y-4">
      {sortToolbar}

      {state.isInitialLoad && state.loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse grid grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-1"
            >
              <div className="aspect-square rounded-lg bg-gray-200" />
              <div className="min-w-0 space-y-2">
                <div className="h-4 rounded bg-gray-200" />
                <div className="h-4 w-3/4 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : state.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.error}
          {state.error.includes("not configured") && (
            <p className="mt-2 text-xs text-amber-800">
              Set TYPESENSE_HOST and TYPESENSE_API_KEY (see lib/typesenseClient.ts).
            </p>
          )}
        </div>
      ) : !state.loading && !state.products.length ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-12 text-center text-sm text-gray-600">
          No products match your filters. Try adjusting brands or price range.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {state.products.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                slug={product.slug}
                name={product.name}
                sku={product.sku}
                price={product.price}
                sale_price={product.sale_price}
                regular_price={product.regular_price}
                on_sale={product.on_sale}
                sale_percentage={
                  product.sale_percentage ?? getSalePercentageFromProduct(product) ?? undefined
                }
                tax_class={product.tax_class}
                tax_status={product.tax_status}
                average_rating={product.average_rating}
                rating_count={product.rating_count}
                imageUrl={
                  typeof (product as any)?.image === "string"
                    ? (product as any).image
                    : (product as any)?.image?.src ||
                      (product as any)?.image?.thumbnail ||
                      (product as any)?.images?.[0]?.src ||
                      ""
                }
                imageAlt={(product as any)?.images?.[0]?.alt || product.name}
              />
            ))}
          </div>

          {state.hasMore && (
            <div ref={observerTarget} className="py-10 text-center">
              {state.loading && (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600" />
                  <span className="text-xs text-gray-500">Loading more...</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
