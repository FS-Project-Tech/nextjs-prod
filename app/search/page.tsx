"use client";

import { Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import Container from "@/components/Container";
import ListingMobileSortFilter from "@/components/ListingMobileSortFilter";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import ShopListingLayout from "@/components/ShopListingLayout";

const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false,
});

function SearchResultsContent() {
  const searchParams = useSearchParams();
  const q = useMemo(() => (searchParams.get("q") || "").trim(), [searchParams]);

  return (
    <ShopListingLayout>
      <div className="min-h-screen py-4">
        <Container>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: q ? `Search: ${q}` : "Search" },
            ]}
          />

          <div className="mb-4 lg:mb-6">
            <h1 className="text-xl font-semibold text-gray-900 lg:text-2xl">
              {q ? `Search results for “${q}”` : "Search"}
            </h1>
            {!q && (
              <p className="mt-1 text-sm text-gray-600">
                Enter a term in the header search to find products.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-6 lg:flex-row">
            <ListingMobileSortFilter />

            <aside className="hidden shrink-0 lg:block lg:w-64">
              <div className="sticky top-24">
                <FilterSidebar />
              </div>
            </aside>

            <div className="min-w-0 flex-1">
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

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen py-8 text-center text-sm text-gray-500">Loading search…</div>
      }
    >
      <SearchResultsContent />
    </Suspense>
  );
}
