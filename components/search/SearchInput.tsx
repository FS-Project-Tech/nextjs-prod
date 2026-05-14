"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MIN_SEARCH_LEN, useSearch } from "@/hooks/useSearch";
import type { TypesenseSearchProduct } from "@/lib/typesense-products";
import { cleanSearchResultTitle } from "@/lib/search-display-name";

export interface SearchInputProps {
  className?: string;
  placeholder?: string;
}

function productHref(p: TypesenseSearchProduct): string {
  const base = `/product/${p.slug}`;
  return p.docType === "variation" ? `${base}?variation_id=${p.id}` : base;
}

function SearchSpinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-teal-700 ${className}`}
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

function SearchInputComponent({
  className = "",
  placeholder = "Search products…",
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    input,
    setInput,
    loading,
    error,
    previewItems,
    previewActiveIndex,
    setPreviewActiveIndex,
    movePreview,
    debouncedQuery,
  } = useSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const showPreview =
    focused &&
    debouncedQuery.trim().length >= MIN_SEARCH_LEN &&
    (loading || previewItems.length > 0 || Boolean(error));

  const urlQ = (searchParams.get("q") || "").trim();

  /** Keep the address bar `q` aligned with what the user typed (same debounce as preview). */
  useEffect(() => {
    if (!pathname.startsWith("/search")) return;
    const d = debouncedQuery.trim();
    if (d.length < MIN_SEARCH_LEN) return;
    if (d === urlQ) return;
    const t = window.setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("q", d);
      p.delete("page");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 450);
    return () => window.clearTimeout(t);
  }, [debouncedQuery, urlQ, pathname, router, searchParams]);

  const applyQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const v = input.trim();
    if (v) {
      params.set("q", v);
    } else {
      params.delete("q");
    }
    params.delete("search");
    params.delete("query");
    params.delete("page");
    const qs = params.toString();
    setFocused(false);
    inputRef.current?.blur();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, input]);

  const openActiveResult = useCallback(() => {
    if (previewActiveIndex >= 0 && previewItems[previewActiveIndex]) {
      router.push(productHref(previewItems[previewActiveIndex]!));
      setFocused(false);
      inputRef.current?.blur();
      setPreviewActiveIndex(-1);
      return true;
    }
    return false;
  }, [previewActiveIndex, previewItems, router, setPreviewActiveIndex]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showPreview && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        movePreview(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        movePreview(-1);
        return;
      }
      if (e.key === "Enter") {
        if (showPreview && openActiveResult()) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === "Escape") {
        setPreviewActiveIndex(-1);
        setFocused(false);
        inputRef.current?.blur();
      }
    },
    [showPreview, movePreview, openActiveResult, setPreviewActiveIndex]
  );

  useEffect(() => {
    if (previewActiveIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-preview-index="${previewActiveIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [previewActiveIndex]);

  return (
    <div className={`relative w-full ${className}`}>
      <form
        role="search"
        className="flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!openActiveResult()) {
            applyQuery();
          }
        }}
      >
        <label className="sr-only" htmlFor="search-page-query">
          Search
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id="search-page-query"
            type="search"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setFocused(false), 180);
            }}
            placeholder={placeholder}
            aria-expanded={showPreview}
            aria-controls={showPreview ? "search-instant-results" : undefined}
            aria-activedescendant={
              showPreview && previewActiveIndex >= 0
                ? `search-preview-${previewActiveIndex}`
                : undefined
            }
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
          />
          {loading ? (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" aria-hidden>
              <SearchSpinner className="h-5 w-5" />
            </span>
          ) : null}
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Search
        </button>
      </form>

      {showPreview ? (
        <div
          ref={listRef}
          id="search-instant-results"
          role="listbox"
          className="absolute z-50 mt-1 max-h-[min(24rem,70vh)] w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {error ? (
            <div role="alert" className="border-b border-red-100 px-4 py-3 text-sm text-red-900">
              {error}
            </div>
          ) : null}
          {loading && previewItems.length === 0 && !error ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
              <SearchSpinner />
              Searching…
            </div>
          ) : null}
          {previewItems.map((p, i) => {
            const active = i === previewActiveIndex;
            return (
              <Link
                key={`${p.docType}-${p.id}`}
                id={`search-preview-${i}`}
                data-preview-index={i}
                role="option"
                aria-selected={active}
                href={productHref(p)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setFocused(false);
                  setPreviewActiveIndex(-1);
                }}
                className={`flex gap-3 px-3 py-2.5 text-left text-sm ${
                  active ? "bg-teal-50 ring-2 ring-teal-600 ring-inset" : "hover:bg-gray-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium text-gray-900">
                    {cleanSearchResultTitle(p.name)}
                  </span>
                  {p.docType === "variation" ? (
                    <span className="mt-0.5 block text-xs font-semibold text-teal-700">Variant</span>
                  ) : null}
                  {p.sku ? (
                    <span className="mt-0.5 block text-xs text-gray-500">SKU: {p.sku}</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function inputPropsEqual(prev: SearchInputProps, next: SearchInputProps) {
  return prev.className === next.className && prev.placeholder === next.placeholder;
}

const SearchInput = memo(SearchInputComponent, inputPropsEqual);
export default SearchInput;
