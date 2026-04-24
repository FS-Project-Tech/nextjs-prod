"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Typesense from "typesense";
import { TYPESENSE_DEFAULT_QUERY_BY } from "@/lib/typesense-products";
import {
  cleanAttributeValuesForDisplay,
  cleanSearchResultTitle,
  cleanVariationOptionLine,
} from "@/lib/search-display-name";

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

const MAX_VARIATION_ROWS_PER_PRODUCT = 8;

type VariationDropdownItem = { id: number; label: string; sku?: string; price?: number };

type FlatSearchRow =
  | { kind: "parent"; doc: Record<string, unknown> }
  | { kind: "variation"; doc: Record<string, unknown>; variation: VariationDropdownItem };

function formatDocPrice(doc: Record<string, unknown>): string {
  const n = Number(doc.price ?? doc.current_price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toFixed(2)}`;
}

/** Parent variable products: use catalog price or derive From $x / range from variation_dropdown. */
function parentPriceDisplay(doc: Record<string, unknown>): string {
  const direct = formatDocPrice(doc);
  if (direct) return direct;
  const vars = parseVariationDropdown(doc);
  const prices = vars
    .map((v) => v.price)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0);
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `$${min.toFixed(2)}`;
  return `From $${min.toFixed(2)}`;
}

function variationPriceDisplay(row: FlatSearchRow): string {
  if (row.kind !== "variation") return "—";
  if (row.variation.price != null && row.variation.price > 0) {
    return `$${Number(row.variation.price).toFixed(2)}`;
  }
  if (String(row.doc.type || "").toLowerCase() === "variation") {
    const p = formatDocPrice(row.doc);
    if (p) return p;
  }
  return "—";
}

/** Stronger matches (e.g. exact SKU) sort above generic parent rows from the same Typesense hit. */
function rowQueryBoost(row: FlatSearchRow, rawQuery: string): number {
  const raw = rawQuery.trim().toLowerCase();
  if (!raw) return 0;
  const tokens = raw
    .split(/[\s,\/&]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);

  let score = 0;
  if (row.kind === "variation") {
    const sk = (row.variation.sku || "").toLowerCase();
    if (sk) {
      if (sk === raw) score += 1_000_000;
      else if (sk.includes(raw) || (raw.length >= 3 && raw.includes(sk))) score += 500_000;
      for (const t of tokens) {
        if (t.length < 2) continue;
        if (sk === t) score += 800_000;
        else if (sk.includes(t)) score += 200_000;
      }
    }
    const lab = (row.variation.label || "").toLowerCase();
    if (lab && lab.includes(raw)) score += 50_000;
  }
  if (row.kind === "parent") {
    const name = String(row.doc.name || "").toLowerCase();
    if (name.includes(raw)) score += 120_000;
    for (const t of tokens) {
      if (t.length >= 3 && name.includes(t)) score += 40_000;
    }
  }
  return score;
}

type TypesenseHitLite = {
  document?: Record<string, unknown>;
  text_match?: number;
};

function buildRankedFlatRows(
  hits: TypesenseHitLite[],
  maxVariations: number,
  queryTrimmed: string
): FlatSearchRow[] {
  const tagged: { row: FlatSearchRow; textMatch: number; seq: number }[] = [];
  let seq = 0;
  const textMatchOf = (h: TypesenseHitLite) =>
    typeof h.text_match === "number" && Number.isFinite(h.text_match) ? h.text_match : 0;

  for (const item of hits) {
    const doc = item.document;
    if (!doc) continue;
    const tm = textMatchOf(item);
    const docType = String(doc.type || "parent").toLowerCase();

    if (docType === "variation") {
      const id = Number(doc.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const sku = String(doc.sku || "").trim();
      const label = variationLabelFromVariationDoc(doc);
      tagged.push({
        row: {
          kind: "variation",
          doc,
          variation: {
            id,
            label: label || sku || `Variation #${id}`,
            sku: sku || undefined,
            price: Number.isFinite(Number(doc.price)) ? Number(doc.price) : undefined,
          },
        },
        textMatch: tm,
        seq: seq++,
      });
      continue;
    }

    tagged.push({ row: { kind: "parent", doc }, textMatch: tm, seq: seq++ });
    for (const variation of parseVariationDropdown(doc).slice(0, maxVariations)) {
      tagged.push({
        row: { kind: "variation", doc, variation },
        textMatch: tm,
        seq: seq++,
      });
    }
  }

  tagged.sort((a, b) => {
    if (b.textMatch !== a.textMatch) return b.textMatch - a.textMatch;
    const qb = rowQueryBoost(b.row, queryTrimmed);
    const qa = rowQueryBoost(a.row, queryTrimmed);
    if (qb !== qa) return qb - qa;
    return a.seq - b.seq;
  });

  return tagged.map((t) => t.row);
}

function productPathWithOptionalVariation(slug: string, variationId?: number): string {
  const s = encodeURIComponent(slug);
  if (variationId != null && Number.isFinite(variationId) && variationId > 0) {
    return `/product/${s}?variation_id=${variationId}`;
  }
  return `/product/${s}`;
}

/** Human label for a Typesense variation row (uses indexed attributes, not raw val_*). */
function variationLabelFromVariationDoc(doc: Record<string, unknown>): string {
  const attrs = doc.attributes;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    const vals = cleanAttributeValuesForDisplay(
      Object.values(attrs as Record<string, unknown>)
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    );
    if (vals.length) return vals.join(" · ");
  }
  const name = String(doc.name || "").trim();
  if (!name) return "";
  const idx = name.indexOf(" - ");
  if (idx > 0) return name.slice(idx + 3).trim();
  return name;
}

function parseVariationDropdown(doc: Record<string, unknown>): VariationDropdownItem[] {
  const raw = doc.variation_dropdown_json;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: VariationDropdownItem[] = [];
    for (const el of arr) {
      if (!el || typeof el !== "object") continue;
      const o = el as Record<string, unknown>;
      const id = Number(o.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const rawLabel = String(o.label || "").trim();
      const label =
        cleanVariationOptionLine(rawLabel) ||
        (!/val_[0-9_]+/i.test(rawLabel) ? rawLabel : "") ||
        `Variation #${id}`;
      const skuRaw = String(o.sku || "").trim();
      const priceNum = Number(o.price);
      const price = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined;
      out.push({ id, label, sku: skuRaw || undefined, price });
    }
    return out;
  } catch {
    return [];
  }
}

function parseSkuTokens(rawQuery: string): string[] {
  const tokens = rawQuery
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    // Keep this permissive for common SKU formats: ABC123, ID-PANTS-MAX, A.B_01
    if (!/^[A-Za-z0-9._-]+$/.test(t)) continue;
    const k = t.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function isLikelySkuToken(token: string): boolean {
  if (!/^[A-Za-z0-9._-]+$/.test(token)) return false;
  // Prefer tokens that are identifier-like, not regular words.
  return /\d/.test(token) || token.includes("-") || token.includes("_");
}

function toTypesenseExactArray(values: string[]): string {
  const escaped = values.map((v) => `\`${String(v).replace(/`/g, "\\`")}\``);
  return `[${escaped.join(",")}]`;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  /** After redirecting to search/product from this box, skip reopening when the in-flight Typesense response returns. */
  const suppressAutoOpenAfterNavigationRef = useRef(false);

  const closePanel = useCallback(() => {
    setShow(false);
    setActiveIndex(-1);
  }, []);

  const clearSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    suppressAutoOpenAfterNavigationRef.current = false;
    setQuery("");
    setResults([]);
    setCategories([]);
    setBrands([]);
    setIsSearching(false);
    closePanel();
    inputRef.current?.focus();
  }, [closePanel]);

  const flatRows = useMemo(
    () =>
      buildRankedFlatRows(
        results as TypesenseHitLite[],
        MAX_VARIATION_ROWS_PER_PRODUCT,
        query.trim()
      ),
    [results, query]
  );

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

  /** Keep header field in sync with `/search?q=` when URL changes (e.g. sidebar category clears `q`). */
  const urlSearchQ = searchParams.get("q") ?? "";
  useEffect(() => {
    if (!pathname.startsWith("/search")) return;
    const q = urlSearchQ.trim();
    setQuery(q);
    if (!q) {
      searchGenerationRef.current += 1;
      setResults([]);
      setCategories([]);
      setBrands([]);
      setShow(false);
      setIsSearching(false);
    }
  }, [pathname, urlSearchQ]);

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
    suppressAutoOpenAfterNavigationRef.current = true;
    closePanel();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }, [query, router, closePanel]);

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

        const skuTokens = parseSkuTokens(query);
        const useSkuFilterSearch =
          skuTokens.length > 1 &&
          (/[,&;\n\r\t]/.test(query) || skuTokens.every((t) => isLikelySkuToken(t)));

        const searchRequest: Record<string, unknown> = {
          q: formattedQuery,
          query_by: TYPESENSE_DEFAULT_QUERY_BY,
          per_page: 10,
          facet_by: "category,brand",
          sort_by: "_text_match:desc",
          split_join_tokens: "always",
        };

        if (useSkuFilterSearch) {
          searchRequest.q = "*";
          searchRequest.query_by = "name,sku";
          searchRequest.filter_by = `sku:=${toTypesenseExactArray(skuTokens)}`;
        }

        const res = await client
          .collections(process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME)
          .documents()
          .search(searchRequest);

        if (searchGenerationRef.current !== gen) return;

        setResults(res.hits || []);

        const catFacet = res.facet_counts?.find((f) => f.field_name === "category");
        setCategories(catFacet?.counts || []);

        const brandFacet = res.facet_counts?.find((f) => f.field_name === "brand");
        setBrands(brandFacet?.counts || []);

        if (suppressAutoOpenAfterNavigationRef.current) {
          suppressAutoOpenAfterNavigationRef.current = false;
        } else {
          // On /search route, keep the suggestion panel closed on URL load.
          // Users can still open it intentionally by focusing the input.
          if (!pathname.startsWith("/search")) {
            setShow(true);
          }
        }
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
  }, [query, pathname]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = flatRows.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (n === 0) return;
      setActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, n - 1)));
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    }

    if (e.key === "Escape") {
      closePanel();
      return;
    }

    if (e.key === "Enter") {
      const row = activeIndex >= 0 ? flatRows[activeIndex] : undefined;
      if (row) {
        suppressAutoOpenAfterNavigationRef.current = true;
        closePanel();
        const slug = String(row.doc.slug || "");
        router.push(
          productPathWithOptionalVariation(
            slug,
            row.kind === "variation" ? row.variation.id : undefined
          )
        );
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
          onFocus={() => {
            suppressAutoOpenAfterNavigationRef.current = false;
            if (query) setShow(true);
          }}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder="Search"
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 pr-1 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:ring-0"
        />

        {query.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSearch}
            className="flex min-h-11 min-w-10 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            aria-label="Clear search and close suggestions"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

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
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(40rem,85vh)] w-full overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
        >
          {categories.length > 0 && (
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="mb-1 text-xs font-semibold text-gray-800 sm:text-sm">Categories</p>
              <div
                role="group"
                aria-label="Matching categories"
                className="-mx-1 flex flex-wrap gap-1 px-1 pb-0.5 sm:gap-1.5"
              >
                {categories.map((cat: { value: string; count: number }) => (
                  <button
                    key={cat.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      suppressAutoOpenAfterNavigationRef.current = true;
                      closePanel();
                      router.push(
                        `/search?category=${encodeURIComponent(cat.value)}`
                      );
                    }}
                    className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-left text-xs font-medium text-gray-900 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 sm:px-2.5 sm:py-1.5 sm:text-sm"
                  >
                    <span className="whitespace-nowrap">{categoryLabel(cat.value)}</span>
                    <span className="ml-1 tabular-nums text-gray-600">({cat.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {brands.length > 0 && (
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="mb-1 text-xs font-semibold text-gray-800 sm:text-sm">Brands</p>
              <div
                role="group"
                aria-label="Matching brands"
                className="-mx-1 flex flex-wrap gap-1 px-1 pb-0.5 sm:gap-1.5"
              >
                {brands.map((brand: { value: string; count: number }) => (
                  <button
                    key={brand.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      suppressAutoOpenAfterNavigationRef.current = true;
                      closePanel();
                      router.push(
                        `/search?q=${encodeURIComponent(query)}&brand=${encodeURIComponent(brand.value)}`
                      );
                    }}
                    className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-left text-xs font-medium text-gray-900 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-600 sm:px-2.5 sm:py-1.5 sm:text-sm"
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
              {flatRows.map((row, index) => {
                const hit = row.doc;
                const slug = String(hit.slug || "");
                const isVariation = row.kind === "variation";

                return (
                  <div
                    key={isVariation ? `v-${hit.id}-${row.variation.id}` : `p-${hit.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`header-search-option-${index}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      suppressAutoOpenAfterNavigationRef.current = true;
                      closePanel();
                      router.push(
                        productPathWithOptionalVariation(
                          slug,
                          isVariation ? row.variation.id : undefined
                        )
                      );
                    }}
                    className={`flex min-h-[44px] cursor-pointer gap-3 rounded-lg p-3 text-left focus-within:ring-2 focus-within:ring-teal-600 ${
                      index === activeIndex ? "bg-gray-100 ring-2 ring-teal-600 ring-offset-2" : "hover:bg-gray-50"
                    } ${isVariation ? "border-l-2 border-teal-500/40 pl-4" : ""}`}
                  >
                    <img
                      src={String(hit.image || "")}
                      alt=""
                      className={`shrink-0 object-contain ${
                        isVariation ? "mt-0.5 h-10 w-10 opacity-80" : "h-14 w-14"
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      {isVariation ? (
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                          Variant
                        </p>
                      ) : null}
                      <p
                        className="text-base font-semibold leading-snug text-gray-900"
                        dangerouslySetInnerHTML={{
                          __html: highlight(cleanSearchResultTitle(String(hit.name || "")), query),
                        }}
                      />
                      <p
                        className="mt-1 text-sm text-gray-600"
                        dangerouslySetInnerHTML={{
                          __html: highlight(
                            isVariation
                              ? String(row.variation.sku || "")
                              : String(
                                  Array.isArray(hit.sku)
                                    ? hit.sku[0] || ""
                                    : hit.sku || ""
                                ),
                            query
                          ),
                        }}
                      />
                      <p className="mt-0.5 text-sm font-semibold text-teal-800">
                        {isVariation ? variationPriceDisplay(row) : parentPriceDisplay(hit)}
                      </p>
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
