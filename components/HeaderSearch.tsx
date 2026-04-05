"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugToLabel(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Prefer stored label when it already looks like a title (not a hyphen slug). */
function prettyFacetValue(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/\s/.test(s)) return s;
  if (!/-/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s)) return s;
  return slugToLabel(s);
}

let categoryNameBySlugCache: Record<string, string> | null = null;
let categoryNameBySlugPromise: Promise<Record<string, string>> | null = null;

async function loadCategorySlugToName(): Promise<Record<string, string>> {
  if (categoryNameBySlugCache) return categoryNameBySlugCache;
  if (categoryNameBySlugPromise) return categoryNameBySlugPromise;

  categoryNameBySlugPromise = fetch("/api/categories", { cache: "force-cache" })
    .then(async (res) => {
      if (!res.ok) return {};
      const data = await res.json();
      const list = Array.isArray(data.categories) ? data.categories : [];
      const map: Record<string, string> = {};
      for (const c of list) {
        const slug = String(c?.slug || "")
          .trim()
          .toLowerCase();
        const name = String(c?.name || "").trim();
        if (slug && name) map[slug] = name;
      }
      categoryNameBySlugCache = map;
      return map;
    })
    .finally(() => {
      categoryNameBySlugPromise = null;
    });

  return categoryNameBySlugPromise;
}

function SearchSpinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-teal-700"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function MagnifierIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export default function HeaderSearch() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [show, setShow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [categorySlugToName, setCategorySlugToName] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadCategorySlugToName()
      .then((map) => {
        if (!cancelled) setCategorySlugToName(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryLabel = useCallback(
    (slug: string) => {
      const key = String(slug || "")
        .trim()
        .toLowerCase();
      return (key && categorySlugToName[key]) || slugToLabel(slug);
    },
    [categorySlugToName]
  );

  const highlight = (text: string, q: string) => {
    if (!q || !text) return text;

    const parts = q.split(/[,\/&\s]+/).filter(Boolean);
    let result = text;

    parts.forEach((part) => {
      const regex = new RegExp(`(${escapeRegExp(part)})`, "gi");
      result = result.replace(
        regex,
        `<mark class="search-hit-mark rounded px-0.5 py-px font-semibold text-gray-900 bg-amber-200 box-decoration-clone">$1</mark>`
      );
    });

    return result;
  };

  const submitSearch = useCallback(() => {
    const q = query.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    setShow(false);
    setActiveIndex(-1);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }, [query, router]);

  useEffect(() => {
    if (!query.trim()) {
      searchGenerationRef.current += 1;
      setResults([]);
      setCategories([]);
      setBrands([]);
      setShow(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const gen = ++searchGenerationRef.current;

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

        if (searchGenerationRef.current !== gen) return;

        setResults(res.hits || []);

        const catFacet = res.facet_counts?.find((f) => f.field_name === "category");
        setCategories(catFacet?.counts || []);

        const brandFacet = res.facet_counts?.find((f) => f.field_name === "brand");
        setBrands(brandFacet?.counts || []);

        setShow(true);
        setActiveIndex(-1);
      } catch (err) {
        console.error(err);
        if (searchGenerationRef.current === gen) {
          setResults([]);
          setCategories([]);
          setBrands([]);
        }
      } finally {
        if (searchGenerationRef.current === gen) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const totalItems = results.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, totalItems - 1));
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (e.key === "Escape") {
      setShow(false);
      return;
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        const hit = results[activeIndex].document;
        router.push(`/product/${hit.slug}`);
      } else {
        submitSearch();
      }
    }
  };

  const panelId = "header-search-panel";
  const productListId = "header-search-product-list";

  return (
    <div className="relative z-[60] w-full max-w-full lg:max-w-[min(100%,42rem)] xl:max-w-[min(100%,48rem)] 2xl:max-w-[52rem]">
      <div className="flex w-full min-w-0 rounded-md border border-gray-800 bg-white shadow-sm transition-shadow focus-within:border-teal-600 focus-within:shadow-md focus-within:ring-2 focus-within:ring-teal-600 focus-within:ring-offset-2">
        <input
          ref={inputRef}
          type="text"
          id="header-search-input"
          role="combobox"
          aria-label="Search products"
          aria-expanded={show}
          aria-controls={panelId}
          aria-autocomplete="list"
          aria-activedescendant={
            show && activeIndex >= 0 ? `header-search-option-${activeIndex}` : undefined
          }
          aria-haspopup="listbox"
          value={query}
          onKeyDown={handleKeyDown}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder="Search"
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:ring-0"
        />

        {isSearching && (
          <div
            className="flex shrink-0 items-center bg-white px-2.5"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Searching for products</span>
            <SearchSpinner />
          </div>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submitSearch}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-l border-gray-200 bg-teal-600 px-4 text-white transition-colors hover:bg-teal-700 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          aria-label="Submit search"
        >
          <MagnifierIcon />
        </button>
      </div>

      {show && (
        <div
          id={panelId}
          role="region"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(24rem,70vh)] w-full overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
        >
          {categories.length > 0 && (
            <div className="border-b border-gray-100 px-3 py-3">
              <p className="mb-2 text-sm font-semibold text-gray-800">Categories</p>
              <div
                role="group"
                aria-label="Matching categories"
                className="-mx-1 flex flex-wrap gap-2 px-1 pb-1"
              >
                {categories.map((cat: { value: string; count: number }) => (
                  <button
                    key={cat.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => router.push(`/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(cat.value)}`)}
                    className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-900 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    <span className="whitespace-nowrap">{categoryLabel(cat.value)}</span>
                    <span className="ml-1 tabular-nums text-gray-600">({cat.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {brands.length > 0 && (
            <div className="border-b border-gray-100 px-3 py-3">
              <p className="mb-2 text-sm font-semibold text-gray-800">Brands</p>
              <div
                role="group"
                aria-label="Matching brands"
                className="-mx-1 flex flex-wrap gap-2 px-1 pb-1"
              >
                {brands.map((brand: { value: string; count: number }) => (
                  <button
                    key={brand.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => router.push(`/search?q=${encodeURIComponent(query)}&brand=${encodeURIComponent(brand.value)}`)}
                    className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-900 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    <span className="whitespace-nowrap">{prettyFacetValue(brand.value)}</span>
                    <span className="ml-1 tabular-nums text-gray-600">({brand.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p id={productListId} className="text-sm font-semibold text-gray-800">
                Products
              </p>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={submitSearch}
                className="min-h-9 shrink-0 rounded-md px-2 text-sm font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                View all
              </button>
            </div>

            <div role="listbox" aria-labelledby={productListId}>
              {results.map((item, index) => {
                const hit = item.document;

                return (
                  <div
                    key={hit.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`header-search-option-${index}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => router.push(`/product/${hit.slug}`)}
                    className={`flex min-h-[52px] cursor-pointer gap-3 rounded-lg p-3 text-left focus-within:ring-2 focus-within:ring-teal-600 ${
                      index === activeIndex ? "bg-gray-100 ring-2 ring-teal-600 ring-offset-2" : "hover:bg-gray-50"
                    }`}
                  >
                    <img
                      src={hit.image}
                      alt=""
                      className="h-14 w-14 shrink-0 object-contain"
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className="text-base font-semibold leading-snug text-gray-900"
                        dangerouslySetInnerHTML={{
                          __html: highlight(hit.name, query),
                        }}
                      />

                      <p className="mt-0.5 text-sm leading-snug text-gray-600">
                        {categoryLabel(String(Array.isArray(hit.category) ? hit.category[0] : hit.category || ""))}
                        {hit.brand ? ` • ${prettyFacetValue(String(hit.brand))}` : ""}
                      </p>

                      <p
                        className="mt-0.5 text-sm text-gray-600"
                        dangerouslySetInnerHTML={{
                          __html: highlight(Array.isArray(hit.sku) ? hit.sku[0] : hit.sku, query),
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
