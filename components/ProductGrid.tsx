"use client";

import { useEffect, useRef, useMemo, useReducer, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { ProductCardProduct } from "@/lib/types/product";
import { getSalePercentageFromProduct } from "@/lib/utils/product";

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
  | { type: 'FETCH_START'; isInitial?: boolean }
  | { type: 'FETCH_SUCCESS'; products: ProductCardProduct[]; total: number; totalPages: number; append: boolean; pageNum: number }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'LOAD_MORE' }
  | { type: 'RESET' };

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "newest", label: "Newest First" },
  { value: "rating", label: "Top Rated" },
  { value: "popularity", label: "Most Popular" },
] as const;

const initialState: GridState = {
  products: [],
  loading: true,
  error: null,
  page: 1,
  total: 0,
  hasMore: true,
  isInitialLoad: true,
};

function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null, isInitialLoad: action.isInitial ?? state.isInitialLoad };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        products: action.append ? [...state.products, ...action.products] : action.products,
        total: action.total,
        hasMore: action.pageNum < action.totalPages,
        loading: false,
        isInitialLoad: false,
      };
    case 'FETCH_ERROR':
      return { ...state, error: action.error, loading: false, isInitialLoad: false };
    case 'LOAD_MORE':
      return { ...state, page: state.page + 1 };
    case 'RESET':
      return { ...initialState, loading: false };
    default:
      return state;
  }
}

export default function ProductGrid({ categorySlug, brandSlug, onSaleOnly }: ProductGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(gridReducer, initialState);
  const observerTarget = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  const filters = useMemo(() => {
    const params: Record<string, string> = {};

    if (categorySlug) params.categorySlug = categorySlug;
    else if (searchParams.get("categories")) params.categories = searchParams.get("categories")!;

    const brands = brandSlug ?? searchParams.get("brand") ?? searchParams.get("brands");
    const sortBy = searchParams.get("sortBy");

    if (brands) params.brands = brands;
    if (sortBy) params.sortBy = sortBy;
    if (onSaleOnly) params.on_sale = "true";

    return params;
  }, [categorySlug, brandSlug, searchParams, onSaleOnly]);

  const fetchProducts = useCallback(async (pageNum: number, append = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const fetchId = ++fetchIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch({ type: 'FETCH_START', isInitial: pageNum === 1 && !append });

    try {
      let json;
      const sortBy = filters.sortBy;

      // 🔥 BRAND SUPPORT
      if (brandSlug) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/custom/v1/brands?slug=${encodeURIComponent(
            brandSlug
          )}&include_products=1`
        );

        const data = await res.json();
        let products = data?.[0]?.products || [];

        const categoryFilter =
          categorySlug ||
          searchParams.get("category") ||
          searchParams.get("categories");
        if (categoryFilter) {
          const cf = String(categoryFilter).trim().toLowerCase();
          products = products.filter(
            (p: { categories?: Array<{ slug?: string }> }) =>
              Array.isArray(p.categories) &&
              p.categories.some((c) => String(c.slug || "").toLowerCase() === cf)
          );
        }

        // 🔥 SORTING
        switch (sortBy) {
          case "price_low":
            products.sort((a: any, b: any) => Number(a.price) - Number(b.price));
            break;
          case "price_high":
            products.sort((a: any, b: any) => Number(b.price) - Number(a.price));
            break;
          case "newest":
            products.sort((a: any, b: any) =>
              new Date(b.date_created || 0).getTime() -
              new Date(a.date_created || 0).getTime()
            );
            break;
          case "rating":
            products.sort((a: any, b: any) =>
              Number(b.average_rating || 0) - Number(a.average_rating || 0)
            );
            break;
          case "popularity":
            products.sort((a: any, b: any) =>
              Number(b.total_sales || 0) - Number(a.total_sales || 0)
            );
            break;
        }

        json = {
          products,
          total: products.length,
          totalPages: 1,
        };
      } else {
        const params = new URLSearchParams({
          ...filters,
          per_page: '24',
          page: String(pageNum),
        });

        const res = await fetch(`/api/products?${params}`, {
          signal: controller.signal,
        });

        json = await res.json();
      }

      if (fetchId !== fetchIdRef.current) return;

      dispatch({
        type: 'FETCH_SUCCESS',
        products: json.products || [],
        total: json.total || 0,
        totalPages: json.totalPages || 1,
        append,
        pageNum,
      });

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      dispatch({ type: 'FETCH_ERROR', error: err.message });
    }
  }, [filters, brandSlug, categorySlug, searchParams]);

  useEffect(() => {
    dispatch({ type: 'RESET' });
    fetchProducts(1);
  }, [fetchProducts]);

  // 🔥 LAZY LOAD
  useEffect(() => {
    if (!observerTarget.current || !state.hasMore || state.loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          dispatch({ type: "LOAD_MORE" });
          fetchProducts(state.page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [state.hasMore, state.loading, state.page, fetchProducts]);

  // 🔥 SKELETON
  if (state.isInitialLoad && state.loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square bg-gray-200 rounded-lg mb-3" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (state.error) return <div>Error: {state.error}</div>;
  if (!state.products.length) return <div>No products found</div>;
  console.log(state.products); 
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
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
          sale_percentage={product.sale_percentage ?? getSalePercentageFromProduct(product) ?? undefined}
          tax_class={product.tax_class}
          tax_status={product.tax_status}
          average_rating={product.average_rating}
          rating_count={product.rating_count}
          imageUrl={product.image ?? product.images?.[0]?.src ?? ""}
          imageAlt={product.images?.[0]?.alt || product.name}
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
    </div>
  );
}