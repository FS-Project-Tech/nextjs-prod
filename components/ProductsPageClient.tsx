"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";
import ShopListingLayout from "@/components/ShopListingLayout";
import ListingMobileSortFilter from "@/components/ListingMobileSortFilter";

// Dynamically import FilterSidebar - heavy component with filters and sliders
const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false, // Client-side only for filters
});

function ProductsPageContent() {
  const searchParams = useSearchParams();

  // Read search query from URL params only (avoid window access during render)
  const searchQuery = useMemo(() => {
    if (!searchParams) return null;
    return (
      searchParams.get("query") || searchParams.get("Search") || searchParams.get("search") || null
    );
  }, [searchParams]);

  const isSearchPage = !!searchQuery;

  return (
    <ShopListingLayout>
      <div className="min-h-screen py-6 lg:py-12" suppressHydrationWarning>
        <Container suppressHydrationWarning>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              isSearchPage
                ? {
                    label: `Search: ${searchQuery}`,
                    href: `/?Search=${encodeURIComponent(searchQuery || "")}`,
                  }
                : { label: "Shop" },
            ]}
          />

          <div className="mb-4 lg:mb-6" suppressHydrationWarning>
            <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
              {isSearchPage ? `Search Results for "${searchQuery}"` : "Our Products"}
            </h1>
            {isSearchPage && (
              <p className="mt-1 text-sm text-gray-600">Found products matching your search</p>
            )}
          </div>

          <ListingMobileSortFilter />

          <div className="flex flex-col lg:flex-row gap-6" suppressHydrationWarning>
            {/* Filter Sidebar - Desktop only */}
            <aside className="hidden lg:block lg:w-64 flex-shrink-0" suppressHydrationWarning>
              <div className="sticky top-24">
                <FilterSidebar />
              </div>
            </aside>

            {/* Product Grid - Wrapped in Suspense for useSearchParams */}
            <div className="flex-1 min-w-0" suppressHydrationWarning>
              <Suspense fallback={<ProductGridSkeleton />}>
                <ProductGrid />
              </Suspense>
            </div>
          </div>
        </Container>
      </div>
    </ShopListingLayout>
  );
}

export default function ProductsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading products...</p>
          </div>
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
