"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TypesenseSearchProduct } from "@/lib/typesense-products";

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LEN = 2;
const PER_PAGE = 24;
const PREVIEW_MAX = 8;

const CLIENT_GROUP_BY = (process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_GROUP_BY || "").trim();

export type SearchListingFilters = Record<string, string>;

type CacheEntry = {
  products: TypesenseSearchProduct[];
  total: number;
  totalPages: number;
};

function stableFilterKey(filters: SearchListingFilters): string {
  const keys = Object.keys(filters).sort();
  return keys.map((k) => `${k}=${filters[k]}`).join("&");
}

function cacheKey(apiQ: string, page: number, filterKey: string): string {
  return `${apiQ.toLowerCase()}\0${page}\0${filterKey}`;
}

function dedupeRows(items: TypesenseSearchProduct[]): TypesenseSearchProduct[] {
  const seen = new Set<string>();
  const out: TypesenseSearchProduct[] = [];
  for (const item of items) {
    const key = `${item.docType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export type SearchContextValue = {
  input: string;
  setInput: (v: string) => void;
  debouncedQuery: string;
  /** Resolved Typesense `q` parameter (empty string = skip fetch; "*" = browse). */
  apiQuery: string;
  results: TypesenseSearchProduct[];
  /** First page / new query in flight (use for input spinner + initial grid skeleton). */
  loading: boolean;
  /** Pagination in flight */
  loadingMore: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
  page: number;
  loadMore: () => void;
  /** For SKU / title highlighting in cards */
  highlightQuery: string;
  previewItems: TypesenseSearchProduct[];
  previewActiveIndex: number;
  setPreviewActiveIndex: (i: number) => void;
  movePreview: (delta: number) => void;
  setListingFilters: (f: SearchListingFilters) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children, urlQuery = "" }: { children: ReactNode; urlQuery?: string }) {
  const [input, setInputState] = useState(urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(() => urlQuery.trim());
  const [listingFilters, setListingFiltersState] = useState<SearchListingFilters>({});
  const [results, setResults] = useState<TypesenseSearchProduct[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewActiveIndex, setPreviewActiveIndex] = useState(-1);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const page1AbortRef = useRef<AbortController | null>(null);
  const appendAbortRef = useRef<AbortController | null>(null);
  const appendBusyRef = useRef(false);
  const reqIdRef = useRef(0);
  const appendReqIdRef = useRef(0);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const prevUrlQueryRef = useRef(urlQuery);
  const listingFiltersRef = useRef(listingFilters);
  listingFiltersRef.current = listingFilters;

  const filterKey = useMemo(() => stableFilterKey(listingFilters), [listingFilters]);

  const apiQuery = useMemo(() => {
    const d = debouncedQuery.trim();
    if (d.length === 0) return "*";
    if (d.length < MIN_SEARCH_LEN) return "";
    return d.slice(0, 100);
  }, [debouncedQuery]);

  const highlightQuery = useMemo(() => {
    const d = debouncedQuery.trim();
    if (d.length >= MIN_SEARCH_LEN) return d;
    return urlQuery.trim();
  }, [debouncedQuery, urlQuery]);

  const previewItems = useMemo(
    () => results.slice(0, PREVIEW_MAX),
    [results]
  );

  useEffect(() => {
    setPreviewActiveIndex((i) => (i >= previewItems.length ? -1 : i));
  }, [previewItems.length]);

  // Debounce typing → debouncedQuery (useState + useEffect + useRef)
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      setDebouncedQuery(input.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [input]);

  // Sync from URL (back/forward, shared links) — immediate, no debounce wait
  useEffect(() => {
    if (prevUrlQueryRef.current === urlQuery) return;
    prevUrlQueryRef.current = urlQuery;
    setInputState(urlQuery);
    setDebouncedQuery(urlQuery.trim());
  }, [urlQuery]);

  const setListingFilters = useCallback((f: SearchListingFilters) => {
    setListingFiltersState((prev) => {
      if (stableFilterKey(prev) === stableFilterKey(f)) return prev;
      return f;
    });
  }, []);

  const setInput = useCallback((v: string) => {
    setInputState(v);
    setPreviewActiveIndex(-1);
  }, []);

  const movePreview = useCallback(
    (delta: number) => {
      if (previewItems.length === 0) return;
      setPreviewActiveIndex((i) => {
        const next = i + delta;
        if (next < 0) return previewItems.length - 1;
        if (next >= previewItems.length) return 0;
        return next;
      });
    },
    [previewItems.length]
  );

  // Page-1 fetch when apiQuery or filters change
  useEffect(() => {
    appendAbortRef.current?.abort();
    appendAbortRef.current = null;

    if (apiQuery === "") {
      page1AbortRef.current?.abort();
      page1AbortRef.current = null;
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setResults([]);
      setTotal(0);
      setTotalPages(1);
      setPage(1);
      return;
    }

    const key1 = cacheKey(apiQuery, 1, filterKey);

    // In-memory cache hit → instant results, no network
    const cached = cacheRef.current.get(key1);
    if (cached) {
      setResults(cached.products);
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setPage(1);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }

    page1AbortRef.current?.abort();
    const ac = new AbortController();
    page1AbortRef.current = ac;
    const rid = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    const usp = new URLSearchParams();
    usp.set("page", "1");
    usp.set("per_page", String(PER_PAGE));
    usp.set("include_facets", "0");
    usp.set("search_ui", "1");
    usp.set("q", apiQuery);

    if (CLIENT_GROUP_BY) {
      usp.set("group_by", CLIENT_GROUP_BY);
      usp.set("group_limit", "12");
    }

    const f = listingFiltersRef.current;
    if (f.category_slug) usp.set("category_slug", f.category_slug);
    if (f.brands) usp.set("brands", f.brands);
    if (f.sortBy) usp.set("sortBy", f.sortBy);
    if (f.min_price) usp.set("min_price", f.min_price);
    if (f.max_price) usp.set("max_price", f.max_price);

    fetch(`/api/typesense/search?${usp.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          products?: TypesenseSearchProduct[];
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || res.statusText || "Search failed");
        return json;
      })
      .then((json) => {
        if (rid !== reqIdRef.current) return;
        const raw = Array.isArray(json.products) ? json.products : [];
        const products = dedupeRows(raw);
        const totalHits = json.total ?? 0;
        const tp = Math.max(1, json.totalPages ?? 1);
        cacheRef.current.set(key1, { products, total: totalHits, totalPages: tp });
        setResults(products);
        setTotal(totalHits);
        setTotalPages(tp);
        setPage(1);
        setError(null);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        if (rid !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (rid === reqIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      ac.abort();
    };
  }, [apiQuery, filterKey]);

  const hasMore = page < totalPages;

  const loadMore = useCallback(() => {
    const q = apiQuery;
    if (q === "" || loading || loadingMore || page >= totalPages || appendBusyRef.current) return;

    const nextPage = page + 1;
    const fk = stableFilterKey(listingFiltersRef.current);
    const keyN = cacheKey(q, nextPage, fk);
    const cached = cacheRef.current.get(keyN);
    if (cached) {
      setResults((prev) => dedupeRows([...prev, ...cached.products]));
      setPage(nextPage);
      return;
    }

    appendBusyRef.current = true;
    appendAbortRef.current?.abort();
    const ac = new AbortController();
    appendAbortRef.current = ac;
    const rid = ++appendReqIdRef.current;
    setLoadingMore(true);

    const usp = new URLSearchParams();
    usp.set("page", String(nextPage));
    usp.set("per_page", String(PER_PAGE));
    usp.set("include_facets", "0");
    usp.set("search_ui", "1");
    usp.set("q", q);
    if (CLIENT_GROUP_BY) {
      usp.set("group_by", CLIENT_GROUP_BY);
      usp.set("group_limit", "12");
    }
    const f = listingFiltersRef.current;
    if (f.category_slug) usp.set("category_slug", f.category_slug);
    if (f.brands) usp.set("brands", f.brands);
    if (f.sortBy) usp.set("sortBy", f.sortBy);
    if (f.min_price) usp.set("min_price", f.min_price);
    if (f.max_price) usp.set("max_price", f.max_price);

    fetch(`/api/typesense/search?${usp.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          products?: TypesenseSearchProduct[];
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || res.statusText || "Search failed");
        return json;
      })
      .then((json) => {
        if (rid !== appendReqIdRef.current) return;
        const raw = Array.isArray(json.products) ? json.products : [];
        const products = dedupeRows(raw);
        cacheRef.current.set(keyN, {
          products,
          total: json.total ?? 0,
          totalPages: Math.max(1, json.totalPages ?? 1),
        });
        setResults((prev) => dedupeRows([...prev, ...products]));
        setPage(nextPage);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        if (rid === appendReqIdRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load more");
        }
      })
      .finally(() => {
        appendBusyRef.current = false;
        if (rid === appendReqIdRef.current) setLoadingMore(false);
      });
  }, [apiQuery, loading, loadingMore, page, totalPages]);

  const value = useMemo<SearchContextValue>(
    () => ({
      input,
      setInput,
      debouncedQuery,
      apiQuery,
      results,
      loading,
      loadingMore,
      error,
      total,
      hasMore,
      page,
      loadMore,
      highlightQuery,
      previewItems,
      previewActiveIndex,
      setPreviewActiveIndex,
      movePreview,
      setListingFilters,
    }),
    [
      input,
      setInput,
      debouncedQuery,
      apiQuery,
      results,
      loading,
      loadingMore,
      error,
      total,
      hasMore,
      page,
      loadMore,
      highlightQuery,
      previewItems,
      previewActiveIndex,
      movePreview,
      setListingFilters,
    ]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearch must be used within <SearchProvider>");
  }
  return ctx;
}

export { DEBOUNCE_MS, MIN_SEARCH_LEN, PREVIEW_MAX };
