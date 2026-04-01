"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";
import ShopListingLayout from "@/components/ShopListingLayout";
import { Suspense } from "react";
import { createSafeHTML } from "@/lib/xss-sanitizer";

const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false,
});

export default function BrandPageClient({
  brandSlug,
  brandName,
  brandDescription,
}: {
  brandSlug: string;
  brandName: string;
  brandDescription?: string | null;
}) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  useEffect(() => {
    if (mobileFiltersOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileFiltersOpen]);

  return (
    <ShopListingLayout>
    <div className="min-h-screen py-4">
      <Container>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop" },
            { label: "Brands", href: "/brands" },
            { label: brandName },
          ]}
        />

        

        {/* Mobile filter button - same pattern as shop page */}
        <div className="lg:hidden sticky top-[72px] z-40 -mx-4 px-4 py-3 bg-white border-b border-gray-200 mb-4">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-expanded={mobileFiltersOpen}
            aria-controls="brand-mobile-filter-drawer"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filters</span>
          </button>
        </div>

        {/* Mobile filter drawer */}
        {mobileFiltersOpen && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/50 lg:hidden animate-in fade-in duration-200"
              onClick={() => setMobileFiltersOpen(false)}
              aria-hidden
            />
            <div
              id="brand-mobile-filter-drawer"
              className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-white shadow-xl lg:hidden animate-in slide-in-from-left duration-300"
              role="dialog"
              aria-modal="true"
              aria-label="Filter products"
            >
              <div className="h-full overflow-y-auto p-4 pb-24">
                <FilterSidebar brandSlug={brandSlug} onClose={() => setMobileFiltersOpen(false)} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="hidden lg:block lg:w-64 flex-shrink-0">
            <div className="sticky top-24">
              <FilterSidebar brandSlug={brandSlug} />
            </div>
          </aside>
          <div className="flex-1 min-w-0">
          <div className="mt-2 mb-8 w-full">
              <h1 className="text-3xl font-bold text-gray-900">{brandName}</h1>
              {brandDescription && (
                <div className="mt-3">
                  <div
                    className={`w-full text-sm leading-relaxed text-gray-600 ${
                      isDescriptionExpanded ? "" : "line-clamp-4"
                    }`}
                    dangerouslySetInnerHTML={createSafeHTML(brandDescription)}
                  />
                  <button
                    type="button"
                    onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                    className="mt-2 text-sm font-medium text-teal-700 hover:text-teal-800"
                    aria-expanded={isDescriptionExpanded}
                  >
                    {isDescriptionExpanded ? "Read less" : "Read more"}
                  </button>
                </div>
              )}
          </div>
            <Suspense fallback={<ProductGridSkeleton />}>
              <ProductGrid brandSlug={brandSlug} />
            </Suspense>
          </div>
        </div>
      </Container>
    </div>
    </ShopListingLayout>
  );
}
