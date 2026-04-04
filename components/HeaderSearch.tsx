"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Typesense from "typesense";

const client = new Typesense.Client({
  nodes: [
    {
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
      port: 443,
      protocol: "https",
    },
  ],
  apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY,
});

export default function HeaderSearch() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [show, setShow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);

  // 🔥 Highlight function
  const highlight = (text: string, query: string) => {
    if (!query) return text;

    const parts = query.split(/[,\/&\s]+/).filter(Boolean);
    let result = text;

    parts.forEach((q) => {
      const regex = new RegExp(`(${q})`, "gi");
      result = result.replace(regex, `<mark class="bg-yellow-200">$1</mark>`);
    });

    return result;
  };

  // 🔥 Search
  useEffect(() => {
    if (!query) {
      setResults([]);
      setCategories([]);
      setBrands([]);
      setShow(false);
      return;
    }

    const delay = setTimeout(async () => {
      try {
        const formattedQuery = query
          .split(/[,\/&\s]+/)
          .map((q) => q.trim())
          .filter(Boolean)
          .join(" || ");

        const res = await client
          .collections(process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME)
          .documents()
          .search({
            q: formattedQuery,
            query_by: "sku,name,category,brand",
            per_page: 5,
            facet_by: "category,brand",
          });

        setResults(res.hits || []);

        const catFacet = res.facet_counts?.find((f) => f.field_name === "category");
        setCategories(catFacet?.counts || []);

        const brandFacet = res.facet_counts?.find((f) => f.field_name === "brand");
        setBrands(brandFacet?.counts || []);

        setShow(true);
        setActiveIndex(-1);
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [query]);

  // 🔥 Keyboard navigation
  const handleKeyDown = (e) => {
    const totalItems = results.length;

    if (e.key === "ArrowDown") {
      setActiveIndex((prev) => Math.min(prev + 1, totalItems - 1));
    }

    if (e.key === "ArrowUp") {
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        const hit = results[activeIndex].document;
        router.push(`/product/${hit.slug}`);
      } else {
        router.push(`/search?q=${encodeURIComponent(query)}`);
      }
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      {/* 🔍 Input */}
      <input
        ref={inputRef}
        type="text"
        id="header-search-input"
        aria-label="Search products"
        value={query}
        onKeyDown={handleKeyDown}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder="Search products..."
        className="w-full border p-2 rounded"
      />

      {/* 🔥 Dropdown */}
      {show && (
        <div className="absolute w-full bg-white shadow-lg mt-1 z-50 rounded max-h-96 overflow-auto">
          {/* 🔥 Categories */}
          {categories.length > 0 && (
            <div className="p-2 border-b">
              <p className="text-xs font-semibold text-gray-400 mb-1">Categories</p>
              {categories.slice(0, 3).map((cat) => (
                <div
                  key={cat.value}
                  onMouseDown={() => router.push(`/search?q=${query}&category=${cat.value}`)}
                  className="text-blue-600 text-sm py-1 cursor-pointer hover:underline"
                >
                  {cat.value} ({cat.count})
                </div>
              ))}
            </div>
          )}

          {/* 🔥 Brands */}
          {brands.length > 0 && (
            <div className="p-2 border-b">
              <p className="text-xs font-semibold text-gray-400 mb-1">Brands</p>
              {brands.slice(0, 3).map((brand) => (
                <div
                  key={brand.value}
                  onMouseDown={() => router.push(`/search?q=${query}&brand=${brand.value}`)}
                  className="text-green-600 text-sm py-1 cursor-pointer hover:underline"
                >
                  {brand.value} ({brand.count})
                </div>
              ))}
            </div>
          )}

          {/* 🔥 Products */}
          <div className="p-2">
            <p className="text-xs font-semibold text-gray-400 mb-1">Products</p>

            {results.map((item, index) => {
              const hit = item.document;

              return (
                <div
                  key={hit.id}
                  onMouseDown={() => router.push(`/product/${hit.slug}`)}
                  className={`flex gap-3 p-2 cursor-pointer rounded ${
                    index === activeIndex ? "bg-gray-100" : "hover:bg-gray-100"
                  }`}
                >
                  <img
                    src={hit.image}
                    alt={hit?.name ? `${hit.name} thumbnail` : ""}
                    className="w-10 h-10 object-contain"
                  />

                  <div>
                    <p
                      className="text-sm font-medium"
                      dangerouslySetInnerHTML={{
                        __html: highlight(hit.name, query),
                      }}
                    />

                    <p className="text-xs text-gray-500">
                      {Array.isArray(hit.category) ? hit.category[0] : hit.category}
                      {hit.brand ? ` • ${hit.brand}` : ""}
                    </p>

                    <p
                      className="text-xs text-gray-400"
                      dangerouslySetInnerHTML={{
                        __html: highlight(Array.isArray(hit.sku) ? hit.sku[0] : hit.sku, query),
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* 🔥 View All */}
            <div
              onMouseDown={() => router.push(`/search?q=${encodeURIComponent(query)}`)}
              className="text-center text-blue-600 text-sm py-2 cursor-pointer hover:underline"
            >
              View all results →
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
