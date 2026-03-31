"use client";

import Image from "next/image";
import Container from "@/components/Container";

interface Brand {
  id?: number;
  name: string;
  slug?: string;
  image?: string;
}

interface CategoryBrandsSectionProps {
  brands: Brand[];
}

export default function CategoryBrandsSection({ brands }: CategoryBrandsSectionProps) {
  if (!brands || brands.length === 0) {
    return null;
  }

  return (
    <Container className="my-12">
      <div className="rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white p-8 shadow-sm">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          Other brands for this product
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {brands.map((brand) => (
            <div
              key={`${brand.slug || brand.id || brand.name}`}
              className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-4 text-center"
            >
              {brand.image ? (
                <div className="relative mb-2 h-16 w-16 overflow-hidden rounded-lg">
                  <Image
                    src={brand.image}
                    alt={brand.name}
                    fill
                    className="object-contain"
                    sizes="64px"
                  />
                </div>
              ) : (
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-400">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-gray-700">
                {brand.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}

