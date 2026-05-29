"use client";

import { Suspense, useMemo, useState } from "react";
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

const FilterSidebar = dynamic(() => import("@/components/FilterSidebar"), {
  loading: () => <FilterSidebarSkeleton />,
  ssr: false,
});

function extractTagSlugFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (!pathname.startsWith("/tag/")) return null;
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

function labelFromSlug(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function TagPageClient({
  initialSlug,
  initialTagName,
  initialTagDescription,
}: {
  initialSlug: string;
  initialTagName?: string;
  initialTagDescription?: string;
}) {
  const pathname = usePathname();
  const tagSlug = extractTagSlugFromPath(pathname) || initialSlug;
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const tagName = useMemo(
    () => initialTagName || labelFromSlug(tagSlug) || "Tag",
    [initialTagName, tagSlug]
  );

  return (
    <ShopListingLayout>
      <div className="min-h-screen py-4" suppressHydrationWarning>
        <Container suppressHydrationWarning>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: tagName },
            ]}
          />

          <div className="flex flex-col gap-6 lg:flex-row" suppressHydrationWarning>
            <ListingMobileSortFilter tagSlug={tagSlug} />

            <aside className="hidden shrink-0 lg:block lg:w-64" suppressHydrationWarning>
              <FilterSidebar tagSlug={tagSlug} />
            </aside>

            <div className="min-w-0 flex-1" suppressHydrationWarning>
              <div className="mb-6" suppressHydrationWarning>
                <p className="mb-1 text-sm font-medium uppercase tracking-wide text-teal-700">
                  Product Tag
                </p>
                <h1 className="text-2xl font-semibold text-gray-900">{tagName}</h1>
                {initialTagDescription ? (
                  <div className="mt-3">
                    <div
                      className={`w-full text-sm leading-relaxed text-gray-600 ${
                        isDescriptionExpanded ? "" : "line-clamp-4"
                      }`}
                    >
                      <div dangerouslySetInnerHTML={createSafeHTML(initialTagDescription)} />
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
                ) : null}
              </div>
              <Suspense fallback={<ProductGridSkeleton />}>
                <ProductGrid tagSlug={tagSlug || undefined} />
              </Suspense>
            </div>
          </div>
        </Container>
      </div>
    </ShopListingLayout>
  );
}
