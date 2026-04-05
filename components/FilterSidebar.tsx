"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useProductListing } from "@/contexts/ProductListingContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import PriceRangeSlider from "@/components/PriceRangeSlider";
import { formatPrice } from "@/lib/format-utils";

/* ================= TYPES ================= */

interface Category {
  id: number;
  name: string;
  slug: string;
  parent?: number;
  count?: number;
}

interface Brand {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

interface Props {
  categorySlug?: string;
  /** When set (e.g. /brands/3m), sidebar lists only categories that contain this brand's products */
  brandSlug?: string;
  /** Match ProductGrid on-sale filter for facet counts */
  onSaleOnly?: boolean;
  isMobileDrawer?: boolean;
  /** Remove card chrome when embedded in full-screen mobile filter overlay */
  mobileFullscreen?: boolean;
  onClose?: () => void;
}

const BRAND_FACET_FIELD = process.env.NEXT_PUBLIC_TYPESENSE_BRAND_FACET || "brand";

const CATEGORY_FACET_FIELD = process.env.NEXT_PUBLIC_TYPESENSE_CATEGORY_FACET || "category";

let categoriesTreeCache: Category[] | null = null;
let categoriesTreePromise: Promise<Category[]> | null = null;

async function loadCategoriesFlat(): Promise<Category[]> {
  if (categoriesTreeCache) return categoriesTreeCache;
  if (categoriesTreePromise) return categoriesTreePromise;

  categoriesTreePromise = fetch("/api/categories", { cache: "force-cache" })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data.categories) ? data.categories : [];
      categoriesTreeCache = list;
      return list;
    })
    .finally(() => {
      categoriesTreePromise = null;
    });

  return categoriesTreePromise;
}

function slugToLabel(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugId(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h << 5) - h + slug.charCodeAt(i);
  return Math.abs(h) || 1;
}

async function fetchTypesenseBrandFacets(opts: {
  categorySlug: string | null;
  minPrice: string;
  maxPrice: string;
  onSaleOnly?: boolean;
}): Promise<Brand[]> {
  const usp = new URLSearchParams();
  usp.set("facets_only", "1");
  usp.set("for_brand_facets", "1");
  usp.set("include_facets", "1");
  if (opts.categorySlug) usp.set("category_slug", opts.categorySlug);
  if (opts.minPrice && /^\d+(\.\d+)?$/.test(opts.minPrice)) {
    usp.set("min_price", opts.minPrice);
  }
  if (opts.maxPrice && /^\d+(\.\d+)?$/.test(opts.maxPrice)) {
    usp.set("max_price", opts.maxPrice);
  }
  if (opts.onSaleOnly) usp.set("on_sale", "true");

  const res = await fetch(`/api/typesense/search?${usp.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) return [];

  const facet = (data.facet_counts || []).find(
    (f: { field_name?: string }) => f.field_name === BRAND_FACET_FIELD
  );
  const counts = Array.isArray(facet?.counts) ? facet.counts : [];
  return counts
    .map((c: { value?: string; count?: number }) => {
      const slug = String(c.value || "")
        .trim()
        .toLowerCase();
      if (!slug) return null;
      return {
        id: slugId(slug),
        name: slugToLabel(slug),
        slug,
        count: typeof c.count === "number" ? c.count : 0,
      } as Brand;
    })
    .filter(Boolean) as Brand[];
}

async function fetchTypesenseCategoryFacetsForBrand(opts: {
  brandSlug: string;
  minPrice: string;
  maxPrice: string;
  onSaleOnly?: boolean;
}): Promise<Category[]> {
  const usp = new URLSearchParams();
  usp.set("facets_only", "1");
  usp.set("include_facets", "1");
  usp.set("for_brand_category_facets", "1");
  usp.set("brand_slug", opts.brandSlug);
  if (opts.minPrice && /^\d+(\.\d+)?$/.test(opts.minPrice)) {
    usp.set("min_price", opts.minPrice);
  }
  if (opts.maxPrice && /^\d+(\.\d+)?$/.test(opts.maxPrice)) {
    usp.set("max_price", opts.maxPrice);
  }
  if (opts.onSaleOnly) usp.set("on_sale", "true");

  const res = await fetch(`/api/typesense/search?${usp.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) return [];

  const facet = (data.facet_counts || []).find(
    (f: { field_name?: string }) => f.field_name === CATEGORY_FACET_FIELD
  );
  const counts = Array.isArray(facet?.counts) ? facet.counts : [];
  return counts
    .map((c: { value?: string; count?: number }) => {
      const slug = String(c.value || "")
        .trim()
        .toLowerCase();
      if (!slug) return null;
      return {
        id: slugId(slug),
        name: slugToLabel(slug),
        slug,
        count: typeof c.count === "number" ? c.count : 0,
      } as Category;
    })
    .filter(Boolean) as Category[];
}

function isNumericOnly(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^\d+$/.test(String(value).trim());
}

function sanitizeBrands(list: Brand[] | undefined | null): Brand[] {
  if (!Array.isArray(list)) return [];
  return list.filter((b) => {
    const name = String(b?.name || "").trim();
    const slug = String(b?.slug || "").trim();
    if (!name) return false;
    if (isNumericOnly(name)) return false;
    if (slug && isNumericOnly(slug)) return false;
    return true;
  });
}

/** True if this category or any descendant has an on-sale (clearance) product per Typesense facet slugs. */
function subtreeHasClearanceProducts(
  slug: string,
  childrenBySlug: Record<string, Category[]>,
  saleSlugs: Set<string>
): boolean {
  if (saleSlugs.has(slug.trim().toLowerCase())) return true;
  const kids = childrenBySlug[slug] || [];
  return kids.some((ch) => subtreeHasClearanceProducts(ch.slug, childrenBySlug, saleSlugs));
}

/**
 * Sum Typesense facet counts for this node and all descendants (full Woo tree).
 * Facet buckets are usually leaf slugs; parents get rolled-up clearance totals.
 */
function clearanceCountRollup(
  slug: string,
  fullChildrenBySlug: Record<string, Category[]>,
  facetCounts: Map<string, number>
): number {
  const norm = slug.trim().toLowerCase();
  let total = facetCounts.get(norm) || 0;
  const kids = fullChildrenBySlug[slug] || [];
  for (const ch of kids) {
    total += clearanceCountRollup(ch.slug, fullChildrenBySlug, facetCounts);
  }
  return total;
}

/** Remove deprecated keys so URLs stay canonical (`brands`, `min_price`, `max_price`). */
function stripDeprecatedFilterParams(params: URLSearchParams, pathname: string) {
  if (!pathname.startsWith("/search")) {
    params.delete("brand");
  }
  params.delete("minPrice");
  params.delete("maxPrice");
}

/* ================= COMPONENT ================= */

export default function FilterSidebar({
  categorySlug,
  brandSlug,
  onSaleOnly,
  isMobileDrawer: _isMobileDrawer,
  mobileFullscreen,
  onClose,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listingCtx = useProductListing();
  const filtersLocked = Boolean(listingCtx?.listingBusy);
  const urlMigratedRef = useRef(false);
  const priceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [brandRelatedCategories, setBrandRelatedCategories] = useState<Category[]>([]);
  const [brandCategoriesLoading, setBrandCategoriesLoading] = useState(false);
  /**
   * Typesense category facet counts for on-sale filter only (slug lowercased → document count).
   * null = not loaded yet (clearance mode only).
   */
  const [clearanceFacetCounts, setClearanceFacetCounts] = useState<Map<string, number> | null>(null);
  const [mobileFilterSection, setMobileFilterSection] = useState<
    "categories" | "price" | "brands"
  >("categories");
  const [mobileBrandSearch, setMobileBrandSearch] = useState("");

  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number }>({
    min: 0,
    max: 1000,
  });
  const [priceMinDraft, setPriceMinDraft] = useState("");
  const [priceMaxDraft, setPriceMaxDraft] = useState("");

  /* ================= ACTIVE ================= */

  const activeCategory = useMemo(() => {
    if (pathname.startsWith("/product-category/")) {
      const nested = pathname.split("/product-category/")[1]?.split("?")[0] || "";
      const parts = nested.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : null;
    }
    return searchParams.get("category") || categorySlug || null;
  }, [pathname, categorySlug, searchParams]);

  const activeBrands = useMemo(() => {
    const val = searchParams.get("brands") || "";
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);

  const isBrandContext = Boolean(brandSlug || pathname.startsWith("/brands/"));

  useEffect(() => {
    if (!onSaleOnly || isBrandContext) {
      setClearanceFacetCounts(null);
      return;
    }
    let cancelled = false;
    const usp = new URLSearchParams();
    usp.set("facets_only", "1");
    usp.set("include_facets", "1");
    usp.set("on_sale", "true");
    usp.set("for_on_sale_category_facets", "1");
    usp.set("q", "*");
    usp.set("max_facet_values", "200");

    fetch(`/api/typesense/search?${usp.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const facet = (data.facet_counts || []).find(
          (f: { field_name?: string }) => f.field_name === CATEGORY_FACET_FIELD
        );
        const counts = Array.isArray(facet?.counts) ? facet.counts : [];
        const next = new Map<string, number>();
        for (const c of counts) {
          const slug = String(c.value ?? "")
            .trim()
            .toLowerCase();
          if (slug && typeof c.count === "number" && c.count > 0) next.set(slug, c.count);
        }
        setClearanceFacetCounts(next);
      })
      .catch(() => {
        if (!cancelled) setClearanceFacetCounts(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [onSaleOnly, isBrandContext]);

  const fullTreeChildrenBySlug = useMemo(() => {
    const byParentId = new Map<number, Category[]>();
    categories.forEach((c) => {
      const parentId = c.parent || 0;
      if (!byParentId.has(parentId)) byParentId.set(parentId, []);
      byParentId.get(parentId)!.push(c);
    });
    const bySlug: Record<string, Category[]> = {};
    categories.forEach((c) => {
      bySlug[c.slug] = byParentId.get(c.id) || [];
    });
    return bySlug;
  }, [categories]);

  const sidebarCategories = useMemo(() => {
    if (!onSaleOnly || isBrandContext) return categories;
    if (clearanceFacetCounts === null) return [];
    if (clearanceFacetCounts.size === 0) return [];
    const saleSlugs = new Set(clearanceFacetCounts.keys());
    return categories.filter((c) =>
      subtreeHasClearanceProducts(c.slug, fullTreeChildrenBySlug, saleSlugs)
    );
  }, [categories, onSaleOnly, isBrandContext, clearanceFacetCounts, fullTreeChildrenBySlug]);

  /** Same tree as sidebarCategories, but counts match Typesense clearance facets (rolled up). */
  const sidebarCategoriesForDisplay = useMemo(() => {
    if (!onSaleOnly || isBrandContext || clearanceFacetCounts === null) {
      return sidebarCategories;
    }
    return sidebarCategories.map((c) => ({
      ...c,
      count: clearanceCountRollup(c.slug, fullTreeChildrenBySlug, clearanceFacetCounts),
    }));
  }, [
    onSaleOnly,
    isBrandContext,
    sidebarCategories,
    fullTreeChildrenBySlug,
    clearanceFacetCounts,
  ]);

  const categoriesBySlug = useMemo(() => {
    const map: Record<string, Category> = {};
    sidebarCategoriesForDisplay.forEach((c) => {
      map[c.slug] = c;
    });
    return map;
  }, [sidebarCategoriesForDisplay]);

  const childrenBySlug = useMemo(() => {
    const byParentId = new Map<number, Category[]>();
    sidebarCategories.forEach((c) => {
      const parentId = c.parent || 0;
      if (!byParentId.has(parentId)) byParentId.set(parentId, []);
      byParentId.get(parentId)!.push(c);
    });
    const bySlug: Record<string, Category[]> = {};
    sidebarCategories.forEach((c) => {
      bySlug[c.slug] = byParentId.get(c.id) || [];
    });
    return bySlug;
  }, [sidebarCategories]);

  const parentBySlug = useMemo(() => {
    const map: Record<string, string | null> = {};
    const byId = new Map<number, Category>();
    sidebarCategories.forEach((c) => byId.set(c.id, c));
    sidebarCategories.forEach((c) => {
      const parent = c.parent ? byId.get(c.parent) : null;
      map[c.slug] = parent?.slug || null;
    });
    return map;
  }, [sidebarCategories]);

  const rootCategorySlugs = useMemo(
    () => sidebarCategories.filter((c) => !c.parent).map((c) => c.slug),
    [sidebarCategories]
  );

  const activeAncestors = useMemo(() => {
    if (!activeCategory) return new Set<string>();
    const chain = new Set<string>();
    let cursor: string | null = activeCategory;
    while (cursor) {
      chain.add(cursor);
      cursor = parentBySlug[cursor] || null;
    }
    return chain;
  }, [activeCategory, parentBySlug]);

  const categoryBrands = useMemo(
    () => sanitizeBrands(brands).sort((a, b) => a.name.localeCompare(b.name)),
    [brands]
  );

  const filteredCategoryBrands = useMemo(() => {
    const q = mobileBrandSearch.trim().toLowerCase();
    if (!q) return categoryBrands;
    return categoryBrands.filter(
      (b) => b.name.toLowerCase().includes(q) || b.slug.includes(q)
    );
  }, [categoryBrands, mobileBrandSearch]);

  const visibleCategoryRows = useMemo(() => {
    if (showAllCategories) return [] as Array<{ cat: Category; level: number }>;
    if (!activeCategory || !categoriesBySlug[activeCategory]) {
      return rootCategorySlugs
        .map((slug) => categoriesBySlug[slug])
        .filter(Boolean)
        .map((cat) => ({ cat, level: 0 }));
    }

    const rows: Array<{ cat: Category; level: number }> = [];
    const pushUnique = (cat?: Category, level = 0) => {
      if (!cat) return;
      if (rows.some((r) => r.cat.slug === cat.slug)) return;
      rows.push({ cat, level });
    };

    const parentSlug = parentBySlug[activeCategory];
    const current = categoriesBySlug[activeCategory];
    const children = childrenBySlug[activeCategory] || [];

    if (parentSlug) {
      pushUnique(categoriesBySlug[parentSlug], 0);
      pushUnique(current, 1);
      children.forEach((c) => pushUnique(c, 2));
    } else {
      pushUnique(current, 0);
      children.forEach((c) => pushUnique(c, 1));
    }

    return rows;
  }, [
    showAllCategories,
    activeCategory,
    categoriesBySlug,
    rootCategorySlugs,
    parentBySlug,
    childrenBySlug,
  ]);

  /* ================= DATA PREFETCH ================= */

  useEffect(() => {
    let mounted = true;
    loadCategoriesFlat()
      .then((list) => {
        if (mounted) setCategories(list);
      })
      .catch((e) => console.error(e));
    return () => {
      mounted = false;
    };
  }, []);

  const searchParamsFacetKey = `${searchParams.get("min_price") || ""}|${searchParams.get("max_price") || ""}`;

  useEffect(() => {
    if (isBrandContext) {
      setBrands([]);
      return;
    }

    let cancelled = false;
    const minP = searchParams.get("min_price") || "";
    const maxP = searchParams.get("max_price") || "";

    const t = window.setTimeout(() => {
      fetchTypesenseBrandFacets({
        categorySlug: activeCategory,
        minPrice: minP,
        maxPrice: maxP,
        onSaleOnly,
      })
        .then((list) => {
          if (!cancelled) setBrands(sanitizeBrands(list));
        })
        .catch(() => {
          if (!cancelled) setBrands([]);
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [activeCategory, searchParamsFacetKey, isBrandContext, onSaleOnly]);

  useEffect(() => {
    if (!brandSlug) {
      setBrandRelatedCategories([]);
      setBrandCategoriesLoading(false);
      return;
    }

    let cancelled = false;
    const minP = searchParams.get("min_price") || "";
    const maxP = searchParams.get("max_price") || "";

    setBrandCategoriesLoading(true);
    const t = window.setTimeout(() => {
      fetchTypesenseCategoryFacetsForBrand({
        brandSlug,
        minPrice: minP,
        maxPrice: maxP,
        onSaleOnly,
      })
        .then((list) => {
          if (!cancelled) setBrandRelatedCategories(list);
        })
        .catch(() => {
          if (!cancelled) setBrandRelatedCategories([]);
        })
        .finally(() => {
          if (!cancelled) setBrandCategoriesLoading(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [brandSlug, searchParamsFacetKey, onSaleOnly]);

  /* Migrate legacy ?brand= & ?minPrice= / ?maxPrice= (once per mount). On /search, ?brand= is a live filter — merge into ?brands= only. */
  useEffect(() => {
    if (urlMigratedRef.current) return;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    const legacyBrand = params.get("brand");
    if (legacyBrand) {
      const set = new Set(
        (params.get("brands") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      set.add(legacyBrand.trim());
      params.set("brands", Array.from(set).join(","));
      params.delete("brand");
      changed = true;
    }
    const minOld = params.get("minPrice");
    if (minOld && !params.get("min_price")) {
      params.set("min_price", minOld);
      params.delete("minPrice");
      changed = true;
    }
    const maxOld = params.get("maxPrice");
    if (maxOld && !params.get("max_price")) {
      params.set("max_price", maxOld);
      params.delete("maxPrice");
      changed = true;
    }
    urlMigratedRef.current = true;
    if (changed) {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  /* Price slider bounds from catalogue (scoped to active category when set) */
  useEffect(() => {
    let cancelled = false;
    const q = activeCategory ? `?category=${encodeURIComponent(activeCategory)}` : "";
    fetch(`/api/filters/price-range${q}`, { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: { min?: number; max?: number }) => {
        if (cancelled || typeof d.min !== "number" || typeof d.max !== "number") {
          return;
        }
        setPriceBounds({
          min: Math.min(d.min, d.max),
          max: Math.max(d.min, d.max),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  useEffect(() => {
    setPriceMinDraft(searchParams.get("min_price") || "");
    setPriceMaxDraft(searchParams.get("max_price") || "");
  }, [searchParams]);

  /* ================= URL ================= */

  const updateURL = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedFilterParams(params, pathname);
      if (pathname.startsWith("/search") && Object.prototype.hasOwnProperty.call(updates, "brands")) {
        params.delete("brand");
      }
      Object.entries(updates).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
      params.delete("page");
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      const cur = searchParams.toString() ? `${pathname}?${searchParams}` : pathname;
      if (next !== cur) {
        router.replace(next, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  const pushPriceToUrl = useCallback(
    (minDraft: string, maxDraft: string) => {
      if (filtersLocked) return;
      const lo = priceBounds.min;
      const hi = priceBounds.max;
      const numRe = /^\d+(\.\d+)?$/;
      const minTrim = minDraft.trim();
      const maxTrim = maxDraft.trim();
      const minN = minTrim && numRe.test(minTrim) ? parseFloat(minTrim) : lo;
      const maxN = maxTrim && numRe.test(maxTrim) ? parseFloat(maxTrim) : hi;
      if (minN <= lo && maxN >= hi) {
        updateURL({ min_price: null, max_price: null });
        setPriceMinDraft("");
        setPriceMaxDraft("");
        return;
      }
      updateURL({
        min_price: minTrim && numRe.test(minTrim) ? minTrim : null,
        max_price: maxTrim && numRe.test(maxTrim) ? maxTrim : null,
      });
    },
    [filtersLocked, priceBounds.min, priceBounds.max, updateURL]
  );

  const schedulePriceUrl = useCallback(
    (minDraft: string, maxDraft: string) => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
      priceDebounceRef.current = setTimeout(() => {
        priceDebounceRef.current = null;
        pushPriceToUrl(minDraft, maxDraft);
      }, 350);
    },
    [pushPriceToUrl]
  );

  const flushPriceDebounce = useCallback(() => {
    if (priceDebounceRef.current) {
      clearTimeout(priceDebounceRef.current);
      priceDebounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    };
  }, []);

  const handleCategorySelect = useCallback(
    (slug: string) => {
      if (brandSlug) {
        const params = new URLSearchParams(searchParams.toString());
        stripDeprecatedFilterParams(params, pathname);
        params.delete("page");
        if (activeCategory === slug) {
          params.delete("category");
        } else {
          params.set("category", slug);
        }
        const q = params.toString();
        router.replace(`/brands/${encodeURIComponent(brandSlug)}${q ? `?${q}` : ""}`, {
          scroll: false,
        });
        onClose?.();
        return;
      }

      if (pathname.startsWith("/search")) {
        const params = new URLSearchParams(searchParams.toString());
        stripDeprecatedFilterParams(params, pathname);
        params.delete("page");
        if (activeCategory === slug) {
          params.delete("category");
        } else {
          params.set("category", slug);
        }
        const qs = params.toString();
        router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
        onClose?.();
        return;
      }

      if (pathname.startsWith("/clearance")) {
        const params = new URLSearchParams(searchParams.toString());
        stripDeprecatedFilterParams(params, pathname);
        params.delete("page");
        if (activeCategory === slug) {
          params.delete("category");
        } else {
          params.set("category", slug);
        }
        const qs = params.toString();
        router.replace(qs ? `/clearance?${qs}` : "/clearance", { scroll: false });
        onClose?.();
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedFilterParams(params, pathname);
      params.delete("category");
      params.delete("page");
      const lineage: string[] = [];
      let cursor: string | null = slug;
      while (cursor) {
        lineage.push(cursor);
        cursor = parentBySlug[cursor] || null;
      }
      lineage.reverse();
      const query = params.toString();
      const categoryPath = `/product-category/${lineage.join("/")}/`;
      router.replace(`${categoryPath}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
      onClose?.();
    },
    [router, searchParams, onClose, parentBySlug, brandSlug, activeCategory, pathname]
  );

  const handleBrandToggle = (slug: string) => {
    if (filtersLocked) return;
    const updated = activeBrands.includes(slug)
      ? activeBrands.filter((b) => b !== slug)
      : [...activeBrands, slug];
    updateURL({
      brands: updated.length ? updated.join(",") : null,
    });
  };

  const applyPriceFilter = () => {
    if (filtersLocked) return;
    flushPriceDebounce();
    pushPriceToUrl(priceMinDraft, priceMaxDraft);
  };

  const clearPriceFilter = () => {
    if (filtersLocked) return;
    flushPriceDebounce();
    setPriceMinDraft("");
    setPriceMaxDraft("");
    updateURL({ min_price: null, max_price: null });
  };

  const handleSliderChange = (minN: number, maxN: number) => {
    if (filtersLocked) return;
    const a = String(minN);
    const b = String(maxN);
    setPriceMinDraft(a);
    setPriceMaxDraft(b);
    schedulePriceUrl(a, b);
  };

  const priceSliderValues = useMemo(() => {
    const lo = priceBounds.min;
    const hi = priceBounds.max;
    const numRe = /^\d+(\.\d+)?$/;
    let minN = lo;
    let maxN = hi;
    const minT = priceMinDraft.trim();
    const maxT = priceMaxDraft.trim();
    if (minT && numRe.test(minT)) minN = Math.round(parseFloat(minT));
    if (maxT && numRe.test(maxT)) maxN = Math.round(parseFloat(maxT));
    minN = Math.min(Math.max(minN, lo), hi);
    maxN = Math.min(Math.max(maxN, lo), hi);
    if (minN > maxN) {
      const t = minN;
      minN = maxN;
      maxN = t;
    }
    return { lo, hi, minN, maxN };
  }, [priceBounds.min, priceBounds.max, priceMinDraft, priceMaxDraft]);

  const toggleCategory = (slug: string) => {
    if (filtersLocked) return;
    setExpandedCategories((prev) => ({
      ...prev,
      [slug]: !prev[slug],
    }));
  };

  const clearFilters = useCallback(() => {
    if (filtersLocked) return;
    if (brandSlug) {
      router.replace(`/brands/${encodeURIComponent(brandSlug)}`, { scroll: false });
      onClose?.();
      return;
    }
    if (pathname.startsWith("/search")) {
      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedFilterParams(params, pathname);
      ["brands", "brand", "min_price", "max_price", "page", "category", "sortBy"].forEach((k) =>
        params.delete(k)
      );
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
      onClose?.();
      return;
    }

    if (pathname.startsWith("/clearance")) {
      const params = new URLSearchParams(searchParams.toString());
      stripDeprecatedFilterParams(params, pathname);
      ["brands", "brand", "min_price", "max_price", "page", "category", "sortBy"].forEach((k) =>
        params.delete(k)
      );
      const qs = params.toString();
      router.replace(qs ? `/clearance?${qs}` : "/clearance", { scroll: false });
      onClose?.();
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    stripDeprecatedFilterParams(params, pathname);
    ["brands", "min_price", "max_price", "page", "category", "sortBy"].forEach((k) =>
      params.delete(k)
    );
    const qs = params.toString();
    const basePath = pathname.startsWith("/product-category/") ? pathname : "/products";
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    onClose?.();
  }, [pathname, router, onClose, brandSlug, searchParams, filtersLocked]);

  /* ================= RENDER ================= */

  const renderTree = (slug: string, level = 0) => {
    const category = categoriesBySlug[slug];
    if (!category) return null;
    const children = childrenBySlug[slug] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedCategories[slug] || activeAncestors.has(slug);
    const isActive = activeCategory === slug;

    return (
      <div key={slug} className="space-y-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={filtersLocked}
            onClick={() => hasChildren && toggleCategory(slug)}
            className={`h-5 w-5 rounded text-xs ${hasChildren ? "text-gray-600 hover:bg-gray-100" : "text-transparent"} disabled:opacity-50`}
            aria-label={
              hasChildren ? (isExpanded ? "Collapse category" : "Expand category") : "No children"
            }
          >
            {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
          </button>

          <button
            type="button"
            disabled={filtersLocked}
            onClick={() => handleCategorySelect(slug)}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
              isActive
                ? "bg-teal-600 text-white font-semibold shadow-sm"
                : "text-gray-700 hover:bg-gray-100"
            } disabled:opacity-50 disabled:pointer-events-none`}
            style={{ marginLeft: `${level * 10}px` }}
          >
            <span className="truncate">{category.name}</span>
            {typeof category.count === "number" && (
              <span className={`ml-2 text-xs ${isActive ? "text-teal-100" : "text-gray-600"}`}>
                {category.count}
              </span>
            )}
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {children.map((child) => renderTree(child.slug, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const shellClass = mobileFullscreen
    ? "space-y-5"
    : "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-5";
  const ShellTag = mobileFullscreen ? "div" : "aside";

  const brandsListClass = "max-h-64 overflow-y-auto pr-1 space-y-1";

  const categoriesBlock = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {brandSlug ? "Categories in this brand" : "Categories"}
        </h3>
        {!brandSlug && (
          <button
            type="button"
            disabled={filtersLocked}
            onClick={() => setShowAllCategories((prev) => !prev)}
            className="shrink-0 text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {showAllCategories ? "Focused View" : "See All Categories"}
          </button>
        )}
      </div>

      <div className="space-y-1 transition-all duration-200">
        {brandSlug ? (
          <>
            <button
              type="button"
              disabled={filtersLocked}
              onClick={() => {
                if (filtersLocked) return;
                const params = new URLSearchParams(searchParams.toString());
                stripDeprecatedFilterParams(params, pathname);
                params.delete("category");
                params.delete("page");
                const q = params.toString();
                router.replace(`/brands/${encodeURIComponent(brandSlug)}${q ? `?${q}` : ""}`, {
                  scroll: false,
                });
                onClose?.();
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                !activeCategory
                  ? "bg-teal-600 text-white font-semibold shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              <span className="truncate">All products</span>
            </button>
            {brandCategoriesLoading ? (
              <p className="text-sm text-gray-500">Loading categories…</p>
            ) : brandRelatedCategories.length === 0 ? (
              <p className="text-sm text-gray-500">No categories found</p>
            ) : (
              brandRelatedCategories.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  disabled={filtersLocked}
                  onClick={() => handleCategorySelect(cat.slug)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    activeCategory === cat.slug
                      ? "bg-teal-600 text-white font-semibold shadow-sm"
                      : "text-gray-700 hover:bg-gray-100"
                  } disabled:opacity-50 disabled:pointer-events-none`}
                >
                  <span className="truncate">{cat.name}</span>
                  {typeof cat.count === "number" && cat.count > 0 && (
                    <span
                      className={`ml-2 text-xs ${activeCategory === cat.slug ? "text-teal-100" : "text-gray-600"}`}
                    >
                      {cat.count}
                    </span>
                  )}
                </button>
              ))
            )}
          </>
        ) : onSaleOnly && !isBrandContext && clearanceFacetCounts === null ? (
          <p className="text-sm text-gray-500">Loading sale categories…</p>
        ) : onSaleOnly && !isBrandContext && clearanceFacetCounts !== null && sidebarCategories.length === 0 ? (
          <p className="text-sm text-gray-500">No categories have clearance products right now.</p>
        ) : showAllCategories ? (
          rootCategorySlugs.map((slug) => renderTree(slug, 0))
        ) : (
          visibleCategoryRows.map(({ cat, level }) => (
            <button
              key={cat.slug}
              type="button"
              disabled={filtersLocked}
              onClick={() => handleCategorySelect(cat.slug)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                activeCategory === cat.slug
                  ? "bg-teal-600 text-white font-semibold shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              } disabled:opacity-50 disabled:pointer-events-none`}
              style={{ marginLeft: `${level * 10}px` }}
            >
              <span className="truncate">{cat.name}</span>
              {typeof cat.count === "number" && (
                <span
                  className={`ml-2 text-xs ${activeCategory === cat.slug ? "text-teal-100" : "text-gray-600"}`}
                >
                  {cat.count}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const priceBlock = (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Price</h3>
      <p className="text-xs text-gray-500">
        Catalogue range {formatPrice(priceBounds.min)} – {formatPrice(priceBounds.max)} (incl. GST)
      </p>
      <PriceRangeSlider
        minBound={priceSliderValues.lo}
        maxBound={priceSliderValues.hi}
        valueMin={priceSliderValues.minN}
        valueMax={priceSliderValues.maxN}
        disabled={filtersLocked}
        onChange={handleSliderChange}
      />
      <p className="text-center text-xs font-medium text-gray-700">
        {formatPrice(priceSliderValues.minN)} – {formatPrice(priceSliderValues.maxN)}
      </p>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-gray-600">
          Min
          <input
            type="number"
            min={priceBounds.min}
            max={priceBounds.max}
            step={1}
            value={priceMinDraft}
            disabled={filtersLocked}
            onChange={(e) => {
              const v = e.target.value;
              setPriceMinDraft(v);
              schedulePriceUrl(v, priceMaxDraft);
            }}
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
        <label className="flex-1 text-xs text-gray-600">
          Max
          <input
            type="number"
            min={priceBounds.min}
            max={priceBounds.max}
            step={1}
            value={priceMaxDraft}
            disabled={filtersLocked}
            onChange={(e) => {
              const v = e.target.value;
              setPriceMaxDraft(v);
              schedulePriceUrl(priceMinDraft, v);
            }}
            className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={filtersLocked}
          onClick={applyPriceFilter}
          className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          Apply price
        </button>
        <button
          type="button"
          disabled={
            filtersLocked || (!searchParams.get("min_price") && !searchParams.get("max_price"))
          }
          onClick={clearPriceFilter}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );

  const renderBrandCheckboxList = (list: Brand[], scrollClass: string) => (
    <div className={scrollClass}>
      {list.length === 0 && <p className="text-sm text-gray-500">No brands found</p>}
      {list.map((b) => {
        const count = b.count;
        const empty = typeof count === "number" && count === 0;
        const disabled = filtersLocked || empty;
        return (
          <label
            key={b.slug}
            className={`flex items-center justify-between rounded-lg px-2 py-2 text-sm transition ${
              disabled
                ? "cursor-not-allowed opacity-50"
                : activeBrands.includes(b.slug)
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={activeBrands.includes(b.slug)}
                disabled={disabled}
                onChange={() => handleBrandToggle(b.slug)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:cursor-not-allowed"
              />
              <span className="truncate">
                {b.name}
                {typeof count === "number" ? ` (${count})` : ""}
              </span>
            </div>
          </label>
        );
      })}
    </div>
  );

  const brandsBlock = !isBrandContext ? (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Brands</h3>
      {renderBrandCheckboxList(categoryBrands, brandsListClass)}
    </div>
  ) : null;

  const clearAllButton = (
    <button
      type="button"
      disabled={filtersLocked}
      onClick={clearFilters}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
    >
      Clear all
    </button>
  );

  const mobileSectionOptions = isBrandContext
    ? (["categories", "price"] as const)
    : (["categories", "price", "brands"] as const);

  type MobileSection = (typeof mobileSectionOptions)[number];

  const effectiveMobileSection: MobileSection =
    mobileFilterSection === "brands" && isBrandContext
      ? "categories"
      : (mobileSectionOptions as readonly string[]).includes(mobileFilterSection)
        ? (mobileFilterSection as MobileSection)
        : "categories";

  const mobileSectionLabels: Record<MobileSection, string> = {
    categories: "Categories",
    price: "Price",
    brands: "Brands",
  };

  if (mobileFullscreen) {
    return (
      <ShellTag className={shellClass}>
        <div className="flex min-h-[min(58vh,560px)] max-h-[calc(100dvh-220px)] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <nav
            className="flex w-[36%] max-w-[9.5rem] shrink-0 flex-col border-r border-gray-200 bg-gray-100 py-1"
            aria-label="Filter sections"
          >
            {mobileSectionOptions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileFilterSection(key)}
                className={`px-3 py-3.5 text-left text-sm transition ${
                  effectiveMobileSection === key
                    ? "border-l-[3px] border-l-teal-600 bg-white font-semibold text-teal-700"
                    : "border-l-[3px] border-l-transparent text-gray-800 hover:bg-white/70"
                }`}
              >
                {mobileSectionLabels[key]}
              </button>
            ))}
          </nav>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-white px-3 py-3">
            {effectiveMobileSection === "categories" && categoriesBlock}
            {effectiveMobileSection === "price" && priceBlock}
            {effectiveMobileSection === "brands" && !isBrandContext && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <svg
                    className="h-5 w-5 shrink-0 text-teal-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search brands"
                    value={mobileBrandSearch}
                    onChange={(e) => setMobileBrandSearch(e.target.value)}
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-0"
                  />
                </div>
                {renderBrandCheckboxList(
                  filteredCategoryBrands,
                  "max-h-[min(52vh,400px)] overflow-y-auto pr-1 space-y-1"
                )}
              </div>
            )}
          </div>
        </div>
        {clearAllButton}
      </ShellTag>
    );
  }

  return (
    <ShellTag className={shellClass}>
      {categoriesBlock}
      {priceBlock}
      {brandsBlock}
      {clearAllButton}
    </ShellTag>
  );
}
