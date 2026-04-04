"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

type Brand = {
  id: number;
  name: string;
  slug: string;
  count?: number;
  image?: string | null | { src?: string; thumbnail?: string };
};

const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function BrandsLazy({ brands }: { brands: Brand[] }) {
  const ITEMS_PER_LOAD = 24;

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_LOAD);

  // 🔥 Filter brands by letter
  const filteredBrands = useMemo(() => {
    if (!selectedLetter) return brands;

    return brands.filter((brand) => brand.name.toUpperCase().startsWith(selectedLetter));
  }, [brands, selectedLetter]);

  const visibleBrands = filteredBrands.slice(0, visibleCount);
  const hasMore = visibleCount < filteredBrands.length;

  return (
    <>
      {/* 🔥 Alphabet Filter */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setSelectedLetter(null);
            setVisibleCount(ITEMS_PER_LOAD);
          }}
          className={`px-3 py-1 rounded border ${
            selectedLetter === null ? "bg-teal-600 text-white" : "bg-white text-gray-700"
          }`}
        >
          All
        </button>

        {ALPHABETS.map((letter) => (
          <button
            key={letter}
            onClick={() => {
              setSelectedLetter(letter);
              setVisibleCount(ITEMS_PER_LOAD); // reset pagination
            }}
            className={`px-3 py-1 rounded border ${
              selectedLetter === letter
                ? "bg-teal-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Grid */}
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibleBrands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={`/brands/${brand.slug}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm transition-all hover:border-teal-300 hover:shadow-md"
            >
              <div className="flex min-h-[150px] items-center justify-center rounded-lg bg-gray-50 p-3">
                {(() => {
                  const imageUrl =
                    typeof brand.image === "string"
                      ? brand.image
                      : brand.image?.src || brand.image?.thumbnail || "";
                  return imageUrl ? (
                    <div className="relative h-32 w-32">
                      <Image
                        src={imageUrl}
                        alt={brand.name}
                        fill
                        className="object-contain"
                        sizes="150px"
                      />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-2xl font-semibold text-teal-700">
                      {brand.name.charAt(0).toUpperCase()}
                    </div>
                  );
                })()}
              </div>

              <span className="mt-3 text-sm font-medium text-gray-900">{brand.name}</span>

              {brand.count ? (
                <span className="text-xs text-gray-500">{brand.count} products</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Load More */}
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_LOAD)}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
          >
            Load More
          </button>
        </div>
      )}

      {/* Empty state */}
      {filteredBrands.length === 0 && (
        <div className="mt-10 text-center text-gray-500">
          No brands found for "{selectedLetter}"
        </div>
      )}
    </>
  );
}
