"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import { categoryTrailToBreadcrumbSegments } from "@/lib/category-breadcrumb-trail";
import type { CategoryTrailItem } from "@/lib/woocommerce/types";
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
  category?: { name: string; description?: string };
  categoryDescription?: string;
  categoryTrail?: CategoryTrailItem[];
}

export default function CategoryPageClient({
  initialSlug,
  initialCategoryName,
  initialCategoryDescription,
  initialCategoryTrail,
}: {
  initialSlug: string;
  initialCategoryName?: string;
  initialCategoryDescription?: string;
  initialCategoryTrail?: CategoryTrailItem[];
}) {
  const pathname = usePathname();
  const [categoryName, setCategoryName] = useState(initialCategoryName || "Category");
  const [categoryDescription, setCategoryDescription] = useState(initialCategoryDescription || "");
  const [categoryTrail, setCategoryTrail] = useState<CategoryTrailItem[]>(initialCategoryTrail ?? []);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // Derive slug from pathname or use initial - no state needed
  const slugFromPath = extractSlugFromPath(pathname);
  const categorySlug = slugFromPath || initialSlug;

  // Fetch category name when slug changes
  const fetchCategoryName = useCallback(
    async (slug: string) => {
      if (slug === initialSlug && initialCategoryName) return;

      try {
        const res = await fetch(`/api/category-by-slug?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) return;

        const json: CategoryResponse = await res.json();
        if (json.category?.name) {
          setCategoryName(json.category.name);
          setCategoryDescription(
            json.categoryDescription || json.category.description || "",
          );
        }
        if (Array.isArray(json.categoryTrail)) {
          setCategoryTrail(json.categoryTrail);
        }
      } catch {
        // Keep existing name on error
      }
    },
    [initialSlug, initialCategoryName],
  );

  useEffect(() => {
    setCategoryName(initialCategoryName || "Category");
    setCategoryDescription(initialCategoryDescription || "");
    setCategoryTrail(initialCategoryTrail ?? []);
  }, [initialSlug, initialCategoryName, initialCategoryDescription, initialCategoryTrail]);

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
              ...(categoryTrail.length > 0
                ? categoryTrailToBreadcrumbSegments(categoryTrail, { omitHrefOnLast: true })
                : [{ label: categoryName }]),
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
