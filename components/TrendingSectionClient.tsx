"use client";

import { ProductCardProduct } from "@/lib/types/product";
import ProductSectionCard from "@/components/ProductSectionCard";

interface Props {
  products: ProductCardProduct[];
}

export default function TrendingSectionClient({ products }: Props) {
  if (!products.length) return null;

  return (
    <ProductSectionCard
      title="Clearance products (on sale)"
      subtitle="Special deals and discounted items"
      products={products}
      loading={false}
      viewAllHref="/clearance/"
    />
  );
}
