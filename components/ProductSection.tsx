import { unstable_noStore } from "next/cache";
import ProductSectionCard from "@/components/ProductSectionCard";
import { fetchCategoryBySlug, fetchProducts } from "@/lib/woocommerce";
import { Product } from "@/lib/types/product";
import { shuffleAndTake } from "@/lib/utils/shuffle-take";

/**
 * Revalidate this section every 5 minutes when not using `shuffle`
 * (shuffle opts out via `unstable_noStore` so order changes every request).
 */
export const revalidate = 300;

const SECTION_SIZE = 5;
const DEFAULT_SHUFFLE_POOL = 40;

interface ProductSectionProps {
  title: string;
  subtitle?: string;
  viewAllHref: string;
  /** When true, fetch a larger pool from the category, shuffle, show `SECTION_SIZE` — new order each request. */
  shuffle?: boolean;
  /** How many products to pull before shuffling (only used when `shuffle` is true). */
  shufflePoolSize?: number;
  query?: {
    categorySlug?: string;
    orderby?: string;
    order?: string;
    featured?: boolean;
  };
}

export default async function ProductSection({
  title,
  subtitle,
  viewAllHref,
  shuffle = false,
  shufflePoolSize = DEFAULT_SHUFFLE_POOL,
  query,
}: ProductSectionProps) {
  if (shuffle) {
    unstable_noStore();
  }

  let categoryId: number | undefined;
  let products: Product[] = [];

  if (query?.categorySlug) {
    try {
      const category = await fetchCategoryBySlug(query.categorySlug);
      if (category?.id) categoryId = category.id;
    } catch {
      // fallback below
    }
  }

  const pool = shuffle
    ? Math.max(SECTION_SIZE, Math.min(shufflePoolSize, 100))
    : SECTION_SIZE;

  try {
    const result = await fetchProducts({
      per_page: pool,
      category: categoryId,
      orderby: query?.orderby,
      order: query?.order,
      featured: query?.featured,
    });
    const raw = result?.products ?? [];
    products = shuffle ? shuffleAndTake(raw, SECTION_SIZE) : raw.slice(0, SECTION_SIZE);
  } catch {
    products = [];
  }

  if (products.length === 0) {
    try {
      const fallback = await fetchProducts({
        per_page: shuffle ? pool : SECTION_SIZE,
        orderby: "popularity",
        order: "desc",
      });
      const raw = fallback?.products ?? [];
      products = shuffle ? shuffleAndTake(raw, SECTION_SIZE) : raw.slice(0, SECTION_SIZE);
    } catch {
      products = [];
    }
  }

  return (
    <ProductSectionCard
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      products={products}
      emptyMessage="No products available at the moment."
    />
  );
}
