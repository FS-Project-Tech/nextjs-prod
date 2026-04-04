"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import ProductsSliderSkeleton from "@/components/skeletons/ProductsSliderSkeleton";
import Container from "@/components/Container";
import { normalizeProductsList } from "@/lib/utils/product";

const ProductsSlider = dynamic(() => import("@/components/ProductsSlider"), {
  loading: () => <ProductsSliderSkeleton />,
  ssr: false,
});

interface ProductSectionCardProps {
  title: string;
  subtitle?: string;
  products: any[] | { products?: any[] } | null | undefined;
  loading?: boolean;
  /** Grid columns on large screens (default 5). */
  gridCols?: 4 | 5 | 6;
  emptyMessage?: string;
  className?: string;
  viewAllHref?: string;
}

/**
 * Reusable product section card component.
 * Used by RecommendedSection, RecentlyViewedSection, TrendingSectionClient, etc.
 */
export default function ProductSectionCard({
  title,
  subtitle,
  products: rawProducts,
  loading = false,
  gridCols = 5,
  emptyMessage = "No products found.",
  className = "",
  viewAllHref,
}: ProductSectionCardProps) {
  const products = normalizeProductsList(rawProducts);

  if (!loading && products.length === 0) {
    return null;
  }

  return (
    <section className={`mb-10 ${className}`}>
      <Container>
        <div className={`rounded-xl px-0 py-6`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
            </div>
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors"
              >
                View all
              </Link>
            )}
          </div>
          {loading && products.length === 0 ? (
            <ProductsSliderSkeleton gridCols={gridCols} count={gridCols} />
          ) : products && products.length > 0 ? (
            <ProductsSlider products={products} gridCols={gridCols} />
          ) : (
            <div className="rounded-lg bg-white p-8 text-center text-gray-600">{emptyMessage}</div>
          )}
        </div>
      </Container>
    </section>
  );
}
