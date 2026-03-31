"use client";

import dynamic from "next/dynamic";
import ProductsSliderSkeleton from "@/components/skeletons/ProductsSliderSkeleton";
import { ProductCardProduct } from "@/lib/types/product";
import Link from "next/link";

const ProductsSlider = dynamic(() => import("@/components/ProductsSlider"), {
  loading: () => <ProductsSliderSkeleton />,
  ssr: false,
});

export interface RelatedProductsSectionProps {
  title: string;
  products: ProductCardProduct[];
  viewAllHref?: string;
}

export default function RelatedProductsSection({
  title,
  viewAllHref,
  products,
}: RelatedProductsSectionProps) {
  if (!products || products.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>

        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm font-medium">
            View all
          </Link>
        )}
      </div>

      <ProductsSlider products={products} gridCols={5} />
    </section>
  );
}
