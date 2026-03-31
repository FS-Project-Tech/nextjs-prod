"use client";
 
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Container from "@/components/Container";
 
type Category = {
  id: number;
  name: string;
  slug: string;
  count: number;
  image: string | null;
};
 
/**
 * Fetch all categories via API (high per_page to get full list)
 */
async function fetchAllCategories(signal: AbortSignal): Promise<Category[]> {
  try {
    const response = await fetch(
      "/api/categories?per_page=100&parent=0&hide_empty=true",
      { signal, next: { revalidate: 3600 } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    const categories = Array.isArray(data) ? data : data.categories || [];
    return categories.map((cat: { id: number; name: string; slug: string; count?: number; image?: { src?: string }; image_url?: string }) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      count: cat.count || 0,
      image: cat.image?.src || cat.image_url || null,
    }));
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== "AbortError") {
      console.error("Categories fetch error:", e);
    }
    return [];
  }
}
 
function CategoryCard({ category }: { category: Category }) {
  const imageSrc = category.image || "/images/category-placeholder.png";
  return (
    <Link
      href={`/product-category/${category.slug}`}
      className="flex h-full flex-row items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-teal-300 hover:shadow-md sm:p-4"
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 sm:h-24 sm:w-24">
        <Image
          src={imageSrc}
          alt={category.name}
          width={96}
          height={96}
          sizes="96px"
          className="h-10 w-10 object-contain sm:h-14 sm:w-14"
        />
      </div>
      <h3 className="min-w-0 flex-1 line-clamp-2 text-left text-xs font-medium text-gray-900 sm:text-sm">
        {category.name}
      </h3>
    </Link>
  );
}
 
export default function AllCategoriesPageClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    const controller = new AbortController();
    fetchAllCategories(controller.signal)
      .then(setCategories)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
 
  return (
    <main className="min-h-screen pb-12 pt-6">
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">All Categories</h1>
          <p className="mt-1 text-gray-600">
            Browse our complete product range by category
          </p>
          <div className="mt-3 h-1 w-24 rounded-full bg-teal-500" />
        </div>
 
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-gray-200 bg-gray-50 sm:h-24"
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="text-gray-500">No categories found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}