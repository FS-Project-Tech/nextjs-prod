import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getUnifiedCategories, getRootCategoriesNonEmpty } from "@/lib/categories-unified";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Browse our product catalogue by category.",
  openGraph: { title: "Catalogue" },
  alternates: { canonical: "/catalogue" },
};

export default async function CataloguePage() {
  const unified = await getUnifiedCategories();
  const categories = getRootCategoriesNonEmpty(unified);

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Catalogue" }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Catalogue</h1>
        <p className="text-gray-600 mb-8">Browse by category</p>

        {!categories.length ? (
          <p className="text-gray-500">No categories found.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/catalogue/${encodeURIComponent(cat.slug)}`}
                  className="group flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
                >
                  <div className="aspect-[4/3] flex items-center justify-center bg-gray-50 p-3 sm:p-4 min-h-[120px] sm:min-h-[140px]">
                    {cat.image?.src ? (
                      <div className="relative w-full h-full rounded-lg overflow-hidden ring-1 ring-gray-200/80 group-hover:ring-teal-200 transition-shadow">
                        <Image
                          src={cat.image.src}
                          alt={cat.image.alt || cat.name}
                          fill
                          className="object-contain group-hover:scale-[1.02] transition-transform duration-200"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-600 flex items-center justify-center shadow-sm group-hover:bg-teal-700 transition-colors flex-shrink-0">
                        <span className="text-white font-semibold text-xl sm:text-2xl uppercase select-none">
                          {cat.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 text-center min-h-[3rem] flex items-center justify-center border-t border-gray-100">
                    <span className="text-sm font-medium text-gray-900 group-hover:text-teal-700 line-clamp-2 leading-snug">
                      {cat.name}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
