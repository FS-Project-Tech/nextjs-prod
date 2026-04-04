"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductGrid from "@/components/ProductGrid";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import FilterSidebarSkeleton from "@/components/skeletons/FilterSidebarSkeleton";
import Container from "@/components/Container";
import ShopListingLayout from "@/components/ShopListingLayout";
import ListingMobileSortFilter from "@/components/ListingMobileSortFilter";
import { createSafeHTML } from "@/lib/xss-sanitizer";

// Dynamically import FilterSidebar - heavy component with filters and sliders
const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false, // Client-side only for filters
});

// Extract slug from pathname
function extractSlugFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (!pathname.startsWith("/product-category/")) return null;
  const nested = pathname.split("/product-category/")[1] || "";
  const parts = nested.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

interface CategoryResponse {
  category?: { name: string };
  categoryDescription?: string;
}

export default function CategoryPageClient({
  initialSlug,
  initialCategoryName,
  initialCategoryDescription,
}: {
  initialSlug: string;
  initialCategoryName?: string;
  initialCategoryDescription?: string;
}) {
  const pathname = usePathname();
  const [categoryName, setCategoryName] = useState(initialCategoryName || "Category");
  const [categoryDescription, setCategoryDescription] = useState(initialCategoryDescription || "");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // Derive slug from pathname or use initial - no state needed
  const slugFromPath = extractSlugFromPath(pathname);
  const categorySlug = slugFromPath || initialSlug;

  // Fetch category name when slug changes
  const fetchCategoryName = useCallback(
    async (slug: string) => {
      if (slug === initialSlug && initialCategoryName && initialCategoryDescription) return;

      try {
        const res = await fetch(`/api/category-by-slug?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) return;

        const json: CategoryResponse = await res.json();
        if (json.category?.name) {
          setCategoryName(json.category.name);
          setCategoryDescription(json.categoryDescription || "");
        }
      } catch {
        // Keep existing name on error
      }
    },
    [initialSlug, initialCategoryName, initialCategoryDescription]
  );

  // Effect to fetch category name when slug changes
  useEffect(() => {
    if (categorySlug && (categorySlug !== initialSlug || !initialCategoryName)) {
      fetchCategoryName(categorySlug);
    }
  }, [categorySlug, initialSlug, initialCategoryName, fetchCategoryName]);

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [categorySlug]);

  return (
    <ShopListingLayout>
      <div className="min-h-screen py-4" suppressHydrationWarning>
        <Container suppressHydrationWarning>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: categoryName },
            ]}
          />

          <div className="flex flex-col lg:flex-row gap-6" suppressHydrationWarning>
            <ListingMobileSortFilter categorySlug={categorySlug} />

            {/* Filter Sidebar */}
            <aside className="hidden lg:block lg:w-64 flex-shrink-0" suppressHydrationWarning>
              <FilterSidebar categorySlug={categorySlug} />
            </aside>

            {/* Product Grid - Wrapped in Suspense for useSearchParams */}
            <div className="flex-1 min-w-0" suppressHydrationWarning>
              <div className="mb-6" suppressHydrationWarning>
                <h1 className="text-2xl font-semibold text-gray-900">{categoryName}</h1>
                {categoryDescription && (
                  <div className="mt-3">
                    <div
                      className={`w-full text-sm leading-relaxed text-gray-600 ${
                        isDescriptionExpanded ? "" : "line-clamp-4"
                      }`}
                    >
                      <div dangerouslySetInnerHTML={createSafeHTML(categoryDescription)} />
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
                <ProductGrid categorySlug={categorySlug || undefined} />
              </Suspense>
            </div>
          </div>
        </Container>
      </div>
    </ShopListingLayout>
  );
}
