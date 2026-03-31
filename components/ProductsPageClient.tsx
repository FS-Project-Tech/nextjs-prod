"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";

// Dynamically import FilterSidebar - heavy component with filters and sliders
const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false, // Client-side only for filters
});

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  
  // Read search query from URL params only (avoid window access during render)
  const searchQuery = useMemo(() => {
    if (!searchParams) return null;
    return searchParams.get("query") || searchParams.get("Search") || searchParams.get("search") || null;
  }, [searchParams]);
  
  const isSearchPage = !!searchQuery;

  // Count active filters for badge
  const activeFilterCount = useCallback(() => {
    let count = 0;
    const brands = searchParams?.get('brands');
    if (brands) count += brands.split(',').length;
    if (searchParams?.get('minPrice') || searchParams?.get('maxPrice')) count += 1;
    return count;
  }, [searchParams]);

  // Prevent body scroll when mobile filters open
  useEffect(() => {
    if (mobileFiltersOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileFiltersOpen]);

  return (
    <div className="min-h-screen py-6 lg:py-12" suppressHydrationWarning>
      <Container suppressHydrationWarning>
        <Breadcrumbs items={[
          { label: 'Home', href: '/' }, 
          isSearchPage ? { label: `Search: ${searchQuery}`, href: `/?Search=${encodeURIComponent(searchQuery || '')}` } : { label: 'Shop' }
        ]} />
        
        <div className="mb-4 lg:mb-6" suppressHydrationWarning>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
            {isSearchPage ? `Search Results for "${searchQuery}"` : 'Our Products'}
          </h1>
          {isSearchPage && (
            <p className="mt-1 text-sm text-gray-600">
              Found products matching your search
            </p>
          )}
        </div>

        {/* Mobile Filter Button - Sticky */}
        <div className="lg:hidden sticky top-[72px] z-40 -mx-4 px-4 py-3 bg-white border-b border-gray-200 mb-4">
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-filter-drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filters</span>
            {activeFilterCount() > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-teal-600 text-white rounded-full">
                {activeFilterCount()}
              </span>
            )}
          </button>
        </div>

        {/* Mobile Filter Drawer */}
        {mobileFiltersOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-50 bg-black/50 lg:hidden animate-in fade-in duration-200"
              onClick={() => setMobileFiltersOpen(false)}
              aria-hidden="true"
            />
            
            {/* Drawer */}
            <div 
              id="mobile-filter-drawer"
              className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-white shadow-xl lg:hidden animate-in slide-in-from-left duration-300"
              role="dialog"
              aria-modal="true"
              aria-label="Filter products"
            >
              <div className="h-full overflow-y-auto p-4 pb-24">
                <FilterSidebar 
                  isMobileDrawer 
                  onClose={() => setMobileFiltersOpen(false)} 
                />
              </div>
              
              {/* Fixed Apply Button */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </>
        )}
        
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
  );
}

export default function ProductsPageClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading products...</p>
        </div>
      </div>
    }>
      <ProductsPageContent />
    </Suspense>
  );
}

