"use client";

import { useEffect, useState } from "react";
import ProductSectionCard from "@/components/ProductSectionCard";
import { ProductCardProduct } from "@/lib/types/product";

/* ============================================================================
   Constants
============================================================================ */

const STORAGE_KEY = "_viewed_products";
const MAX_STORAGE_ITEMS = 20;
const FETCH_LIMIT = 10;

/* ============================================================================
   Types
============================================================================ */

interface ViewedProduct {
  id: number;
  cats?: number[];
}

/* ============================================================================
   Helpers (SSR-safe)
============================================================================ */

function getRecentlyViewedIds(): number[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ViewedProduct[];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => typeof item?.id === "number")
      .map((item) => item.id)
      .slice(0, MAX_STORAGE_ITEMS);
  } catch {
    return [];
  }
}

/* ============================================================================
   Component
============================================================================ */

export default function RecentlyViewedSection() {
  const [products, setProducts] = useState<ProductCardProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = getRecentlyViewedIds().slice(0, FETCH_LIMIT);
    if (!ids.length) return;

    const controller = new AbortController();

    async function fetchProducts() {
      try {
        setLoading(true);

        const res = await fetch(`/api/products-by-ids?ids=${ids.join(",")}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Failed to fetch products");

        const data = await res.json();
        setProducts(Array.isArray(data?.products) ? data.products : []);
      } catch (err) {
        if (!(err instanceof DOMException)) {
          setProducts([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
    return () => controller.abort();
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <ProductSectionCard
      title="Continue browsing"
      subtitle="Recently viewed by you"
      products={products}
      loading={loading}
    />
  );
}
