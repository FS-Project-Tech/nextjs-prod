"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Container from "@/components/Container";
import { fetchUnifiedCategoriesClient } from "@/lib/client-unified-categories";

type Category = {
  id: number;
  name: string;
  slug: string;
  count: number;
  image: string | null;
};

async function fetchAllCategories(signal: AbortSignal): Promise<Category[]> {
  try {
    const payload = await fetchUnifiedCategoriesClient({ signal });
    return payload.roots
      .filter((c) => c.count > 0)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        count: cat.count || 0,
        image: cat.image?.src || null,
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
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">All categories</h1>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" aria-hidden />
            ))}
          </div>
        ) : !categories.length ? (
          <p className="text-gray-500">No categories found.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {categories.map((cat) => (
              <li key={cat.id}>
                <CategoryCard category={cat} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
