import ProductSectionCard from "@/components/ProductSectionCard";
import { fetchCategoryBySlug, fetchProducts } from "@/lib/woocommerce";
import { Product } from "@/lib/types/product";

/**
 * Revalidate this section every 5 minutes
 * (Ideal for homepage / category sections)
 */
export const revalidate = 300;

const SECTION_SIZE = 5;

interface ProductSectionProps {
  title: string;
  subtitle?: string;
  viewAllHref: string;
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
  query,
}: ProductSectionProps) {
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

  try {
    const result = await fetchProducts({
      per_page: SECTION_SIZE,
      category: categoryId,
      orderby: query?.orderby,
      order: query?.order,
      featured: query?.featured,
    });
    products = result?.products ?? [];
  } catch {
    products = [];
  }

  if (products.length === 0) {
    try {
      const fallback = await fetchProducts({
        per_page: SECTION_SIZE,
        orderby: "popularity",
        order: "desc",
      });
      products = fallback?.products ?? [];
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
