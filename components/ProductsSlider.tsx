"use client";

import { useMemo } from "react";
import ProductCard from "@/components/ProductCard";
import { ProductCardProduct } from "@/lib/types/product";
import { getSalePercentageFromProduct, normalizeProductsList } from "@/lib/utils/product";

interface ProductsSliderProps {
  products: ProductCardProduct[] | { products?: ProductCardProduct[] } | null | undefined;
  /** Grid columns on large screens (default 5). */
  gridCols?: 4 | 5 | 6;
}

export default function ProductsSlider({
  products: rawProducts,
  gridCols = 5,
}: ProductsSliderProps) {
  const products = useMemo(() => normalizeProductsList(rawProducts), [rawProducts]);

  if (!products || products.length === 0) {
    return null;
  }

  const renderProductCard = (
    p: ProductCardProduct & {
      meta_data?: unknown[];
      description?: string;
      short_description?: string;
    }
  ) => (
    <ProductCard
      id={p.id}
      slug={p.slug}
      name={p.name}
      sku={p.sku}
      price={p.price}
      sale_price={p.sale_price}
      regular_price={p.regular_price}
      on_sale={p.on_sale}
      sale_percentage={p.sale_percentage ?? getSalePercentageFromProduct(p) ?? undefined}
      tax_class={p.tax_class}
      tax_status={p.tax_status}
      average_rating={p.average_rating}
      rating_count={p.rating_count}
      imageUrl={p.images?.[0]?.src}
      imageAlt={p.images?.[0]?.alt || p.name}
      tags={p.tags}
    />
  );

  const gridClass =
    gridCols === 6
      ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6 items-stretch w-full"
      : gridCols === 5
        ? "grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-5 items-stretch w-full"
        : "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 items-stretch w-full";

  return (
    <div className={gridClass}>
      {products.map((p) => (
        <div key={p.id} className="h-full min-h-0 flex flex flex-col w-full">
          {renderProductCard(p)}
        </div>
      ))}
    </div>
  );
}
