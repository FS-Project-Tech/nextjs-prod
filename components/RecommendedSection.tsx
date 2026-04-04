"use client";

import { useEffect, useRef, useState } from "react";
import ProductSectionCard from "@/components/ProductSectionCard";
import { getRecentSearchTerms } from "@/lib/history";
import { ProductCardProduct } from "@/lib/types/product";

/* ================================
   Helpers
================================ */

const mapToProductCardProducts = (items: unknown[]): ProductCardProduct[] => {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item: any) => item?.id && item?.slug && item?.name)
    .map((item: any) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      sku: item.sku ?? null,
      price: String(item.price ?? item.sale_price ?? "0"),
      regular_price: String(item.regular_price ?? item.price ?? "0"),
      sale_price: item.sale_price ?? null,
      on_sale: Boolean(item.on_sale),
      tax_class: item.tax_class,
      tax_status: item.tax_status,
      average_rating: item.average_rating,
      rating_count: item.rating_count,
      images: Array.isArray(item.images)
        ? item.images
        : item.image
          ? [{ src: item.image, alt: item.name }]
          : [],
      tags: Array.isArray(item.tags)
        ? item.tags.map((t: { id?: number; name?: string; slug?: string }) => ({
            id: t.id ?? 0,
            name: t.name ?? "",
            slug: t.slug ?? "",
          }))
        : undefined,
    }));
};

const RECOMMENDED_SECTION_SIZE = 5;

const fetchFallbackProducts = async (signal: AbortSignal): Promise<ProductCardProduct[]> => {
  const res = await fetch(
    `/api/typesense/search?per_page=${RECOMMENDED_SECTION_SIZE}&page=1&sortBy=popularity&q=*`,
    {
      signal,
      next: { revalidate: 300 },
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return mapToProductCardProducts(data.products).slice(0, RECOMMENDED_SECTION_SIZE);
};

/* ================================
   Component
================================ */

export default function RecommendedSection() {
  const [products, setProducts] = useState<ProductCardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      try {
        const terms = getRecentSearchTerms().slice(0, 4);

        let recommended: ProductCardProduct[] = [];

        // 🔥 SINGLE backend request
        if (terms.length > 0) {
          const res = await fetch("/api/recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ terms }),
            signal: controller.signal,
          });

          if (res.ok) {
            const data = await res.json();
            recommended = mapToProductCardProducts(data.products).slice(
              0,
              RECOMMENDED_SECTION_SIZE
            );
          }
        }

        // Fallback if search-based empty
        if (recommended.length === 0) {
          recommended = await fetchFallbackProducts(controller.signal);
        }

        setProducts(recommended);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("RecommendedSection error", e);
        }
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => controller.abort();
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <ProductSectionCard
      title="Products you may be looking for"
      subtitle="Based on your recent searches"
      products={products}
      loading={loading}
      gridCols={5}
      viewAllHref="/recommended?sortBy=popularity"
    />
  );
}
