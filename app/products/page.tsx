import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";

import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import Container from "@/components/Container";
import Breadcrumbs from "@/components/Breadcrumbs";
import { fetchProductSEO } from "@/lib/wordpress";
import ProductGridAlgolia from "@/components/ProductGridAlgolia";
import FilterSidebar from "@/components/FilterSidebar";


export async function generateMetadata(): Promise<Metadata> {
  // Optional: you can remove this if not needed for listing page
  return {
    title: "Products",
    description: "Browse our products",
  };
}

export default function ProductsPage({ searchParams }: any) {
  const searchQuery =
    searchParams?.query ||
    searchParams?.Search ||
    searchParams?.search ||
    null;

  const isSearchPage = !!searchQuery;

  // const isFiltering =
  // searchParams.get("search") ||
  // searchParams.get("brands") ||
  // searchParams.get("categories") ||
  // searchParams.get("minPrice");

  return (
    <div className="min-h-screen py-6 lg:py-12">
      <Container>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            isSearchPage
              ? {
                  label: `Search: ${searchQuery}`,
                  href: `/?Search=${encodeURIComponent(searchQuery || "")}`,
                }
              : { label: "Products" },
          ]}
        />

        {/* Title */}
        <div className="mb-4 lg:mb-6">
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
            {isSearchPage
              ? `Search Results for "${searchQuery}"`
              : "Our Products"}
          </h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="hidden lg:block lg:w-64 flex-shrink-0">
            <div className="sticky top-24">
              <FilterSidebar />
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            <Suspense fallback={<ProductGridSkeleton count={8} />}>
            {/* {isFiltering ? (
                <ProductGridAlgolia />
              ) : ( */}
                <ProductGrid /> // your existing SSR grid
              {/* )} */}
            </Suspense>
          </div>
        </div>
      </Container>
    </div>
  );
}