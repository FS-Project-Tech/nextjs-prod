"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";
import ShopListingLayout from "@/components/ShopListingLayout";
import ListingMobileSortFilter from "@/components/ListingMobileSortFilter";

const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false,
});

export default function RecommendedPageClient() {
  return (
    <ShopListingLayout>
      <div className="min-h-screen py-12" suppressHydrationWarning>
        <Container suppressHydrationWarning>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: "Products you may be looking for" },
            ]}
          />

          <div className="mb-6" suppressHydrationWarning>
            <h1 className="text-2xl font-semibold text-gray-900">
              Products you may be looking for
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Based on your recent searches — browse all related products
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-6" suppressHydrationWarning>
            <ListingMobileSortFilter />

            <aside className="hidden lg:block lg:w-64 flex-shrink-0" suppressHydrationWarning>
              <FilterSidebar />
            </aside>

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
