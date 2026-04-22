"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";
import ShopListingLayout from "@/components/ShopListingLayout";
import ListingMobileSortFilter from "@/components/ListingMobileSortFilter";
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
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [brandSlug]);

  return (
    <ShopListingLayout>
      <div className="min-h-screen py-4" suppressHydrationWarning>
        <Container suppressHydrationWarning>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: "Brands", href: "/brands" },
              { label: brandName },
            ]}
          />

          <div className="flex flex-col lg:flex-row gap-6" suppressHydrationWarning>
            <ListingMobileSortFilter brandSlug={brandSlug} />

            <aside className="hidden lg:block lg:w-64 flex-shrink-0" suppressHydrationWarning>
              <FilterSidebar brandSlug={brandSlug} />
            </aside>

            <div className="flex-1 min-w-0" suppressHydrationWarning>
              <div className="mb-6" suppressHydrationWarning>
                <h1 className="text-2xl font-semibold text-gray-900">{brandName}</h1>
                {brandDescription && (
                  <div className="mt-3">
                    <div
                      className={`w-full text-sm leading-relaxed text-gray-600 ${
                        isDescriptionExpanded ? "" : "line-clamp-4"
                      }`}
                    >
                      <div dangerouslySetInnerHTML={createSafeHTML(brandDescription)} />
                    </div>
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
