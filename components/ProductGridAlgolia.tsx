// ProductGridAlgolia.tsx
"use client";

import { useHits } from "react-instantsearch";
import ProductCard from "@/components/ProductCard";

export default function ProductGridAlgolia() {
  const { hits } = useHits();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {hits.map((product: any) => (
        <ProductCard
          key={product.objectID}
          id={product.post_id}
          name={product.post_title}
          slug={product.slug}
          price={product.price}
          imageUrl={
            product.images?.[0]?.src ||
            product.images?.[0]?.url ||
            (typeof product.image === "string"
              ? product.image
              : product.image?.src || product.image?.thumbnail || "") ||
            ""
          }
          
          imageAlt={product.images?.[0]?.alt || product.post_title}
          sku={product.sku}
        />
      ))}
    </div>
  );
}