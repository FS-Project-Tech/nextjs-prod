"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";

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
  isMobileDrawer?: boolean;
  onClose?: () => void;
}

const brandCategoriesCache: Record<string, Category[]> = {};
const brandCategoriesPromises = new Map<string, Promise<Category[]>>();

async function loadCategoriesForBrand(brandSlug: string): Promise<Category[]> {
  const cachedList = brandCategoriesCache[brandSlug];
  if (cachedList && cachedList.length > 0) return cachedList;

  const pending = brandCategoriesPromises.get(brandSlug);
  if (pending) return pending;

  const p = fetch(`/api/brands/${encodeURIComponent(brandSlug)}/categories`, {
    cache: "force-cache",
  })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data.categories) ? data.categories : [];
      brandCategoriesCache[brandSlug] = list;
      return list;
    })
    .finally(() => {
      brandCategoriesPromises.delete(brandSlug);
    });

  brandCategoriesPromises.set(brandSlug, p);
  return p;
}

interface FiltersPayload {
  categories: Category[];
  brandsByCategory: Record<string, Brand[]>;
  allBrands: Brand[];
}

const FILTERS_ALL_ENDPOINT = "/api/filters/all";
let filtersCache: FiltersPayload | null = null;
let filtersPromise: Promise<FiltersPayload> | null = null;

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

async function loadFiltersAll(): Promise<FiltersPayload> {
  if (filtersCache) return filtersCache;
  if (filtersPromise) return filtersPromise;

  filtersPromise = fetch(FILTERS_ALL_ENDPOINT, { cache: "force-cache" })
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to load filters");
      const data = await res.json();
      const payload: FiltersPayload = {
        categories: Array.isArray(data.categories) ? data.categories : [],
        brandsByCategory:
          data.brandsByCategory && typeof data.brandsByCategory === "object"
            ? data.brandsByCategory
            : {},
        allBrands: sanitizeBrands(Array.isArray(data.allBrands) ? data.allBrands : []),
      };
      filtersCache = payload;
      return payload;
    })
    .finally(() => {
      filtersPromise = null;
    });

  return filtersPromise;
}

/* ================= COMPONENT ================= */

export default function FilterSidebar({ categorySlug, brandSlug, isMobileDrawer, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>(filtersCache?.categories || []);
  const [brandsByCategory, setBrandsByCategory] = useState<Record<string, Brand[]>>(
    filtersCache?.brandsByCategory || {}
  );
  const [allBrandsFallback, setAllBrandsFallback] = useState<Brand[]>(
    filtersCache?.allBrands || []
  );
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [brandRelatedCategories, setBrandRelatedCategories] = useState<Category[]>(
    brandSlug ? brandCategoriesCache[brandSlug] || [] : []
  );
  const [brandCategoriesLoading, setBrandCategoriesLoading] = useState(
    Boolean(brandSlug && !(brandCategoriesCache[brandSlug]?.length ?? 0))
  );

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
    const val = searchParams.get("brand") || searchParams.get("brands") || "";
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }, [searchParams]);

  const isBrandContext = Boolean(brandSlug || pathname.startsWith("/brands/"));
  const isShopPage = !activeCategory && !isBrandContext;

  const categoriesBySlug = useMemo(() => {
    const map: Record<string, Category> = {};
    categories.forEach((c) => {
      map[c.slug] = c;
    });
    return map;
  }, [categories]);

  const childrenBySlug = useMemo(() => {
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

  const parentBySlug = useMemo(() => {
    const map: Record<string, string | null> = {};
    const byId = new Map<number, Category>();
    categories.forEach((c) => byId.set(c.id, c));
    categories.forEach((c) => {
      const parent = c.parent ? byId.get(c.parent) : null;
      map[c.slug] = parent?.slug || null;
    });
    return map;
  }, [categories]);

  const rootCategorySlugs = useMemo(
    () => categories.filter((c) => !c.parent).map((c) => c.slug),
    [categories]
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

  const allBrands = useMemo(() => {
    if (Object.keys(brandsByCategory).length === 0) {
      return allBrandsFallback;
    }
    const merged = new Map<string, Brand>();
    Object.values(brandsByCategory).forEach((list) => {
      list.forEach((b) => {
        if (!merged.has(b.slug)) merged.set(b.slug, b);
      });
    });
    const mergedList = Array.from(merged.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    return mergedList.length ? mergedList : allBrandsFallback;
  }, [brandsByCategory, allBrandsFallback]);

  const categoryBrands = useMemo(() => {
    if (!activeCategory) return allBrands;
    const mapped = brandsByCategory[activeCategory];
    if (Array.isArray(mapped) && mapped.length > 0) return mapped;
    return allBrands;
  }, [activeCategory, allBrands, brandsByCategory]);

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
  }, [showAllCategories, activeCategory, categoriesBySlug, rootCategorySlugs, parentBySlug, childrenBySlug]);

  /* ================= DATA PREFETCH ================= */

  useEffect(() => {
    let mounted = true;
    loadFiltersAll()
      .then((payload) => {
        if (!mounted) return;
        setCategories(payload.categories);
        const nextBrandsByCategory: Record<string, Brand[]> = {};
        Object.entries(payload.brandsByCategory || {}).forEach(([slug, list]) => {
          nextBrandsByCategory[slug] = sanitizeBrands(list);
        });
        setBrandsByCategory(nextBrandsByCategory);
        setAllBrandsFallback(sanitizeBrands(payload.allBrands || []));
      })
      .catch((e) => {
        console.error(e);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (allBrandsFallback.length > 0) return;
    let mounted = true;
    fetch("/api/filters/brands", { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : { brands: [] }))
      .then((data) => {
        if (!mounted) return;
        const brands = Array.isArray(data?.brands) ? data.brands : [];
        if (brands.length > 0) {
          setAllBrandsFallback(sanitizeBrands(brands));
        }
      })
      .catch(() => {
        // keep silent fallback
      });
    return () => {
      mounted = false;
    };
  }, [allBrandsFallback.length]);

  useEffect(() => {
    if (brandSlug) return;
    if (!activeCategory) return;
    const mapped = brandsByCategory[activeCategory];
    if (Array.isArray(mapped) && mapped.length > 0) return;

    let mounted = true;
    fetch(`/api/filters/brands?category=${encodeURIComponent(activeCategory)}`, {
      cache: "force-cache",
    })
      .then((res) => (res.ok ? res.json() : { brands: [] }))
      .then((data) => {
        if (!mounted) return;
        const brands = Array.isArray(data?.brands) ? data.brands : [];
        if (brands.length === 0) return;
        setBrandsByCategory((prev) => ({
          ...prev,
          [activeCategory]: sanitizeBrands(brands),
        }));
      })
      .catch(() => {
        // silent fallback
      });

    return () => {
      mounted = false;
    };
  }, [activeCategory, brandsByCategory, brandSlug]);

  useEffect(() => {
    if (!brandSlug) {
      setBrandRelatedCategories([]);
      setBrandCategoriesLoading(false);
      return;
    }
    if (brandCategoriesCache[brandSlug]?.length) {
      setBrandRelatedCategories(brandCategoriesCache[brandSlug]);
      setBrandCategoriesLoading(false);
      return;
    }
    let mounted = true;
    setBrandCategoriesLoading(true);
    loadCategoriesForBrand(brandSlug).then((list) => {
      if (!mounted) return;
      setBrandRelatedCategories(list);
      setBrandCategoriesLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [brandSlug]);

  /* ================= URL ================= */

  const updateURL = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([k, v]) =>
        v ? params.set(k, v) : params.delete(k)
      );

      const newUrl = `${pathname}?${params.toString()}`;
      const currentUrl = `${pathname}?${searchParams.toString()}`;

      if (newUrl !== currentUrl) {
        router.replace(newUrl, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  const handleCategorySelect = useCallback((slug: string) => {
    if (brandSlug) {
      const params = new URLSearchParams(searchParams.toString());
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

    const params = new URLSearchParams(searchParams.toString());
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
    router.push(`${categoryPath}${query ? `?${query}` : ""}`, { scroll: false });
    onClose?.();
  }, [router, searchParams, onClose, parentBySlug, brandSlug, activeCategory]);

  const handleBrandToggle = (slug: string) => {
    const updated = activeBrands.includes(slug)
      ? activeBrands.filter((b) => b !== slug)
      : [...activeBrands, slug];

    updateURL({
      brand: updated.length ? updated.join(",") : null,
      brands: updated.length ? updated.join(",") : null,
    });
  };

  const toggleCategory = (slug: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [slug]: !prev[slug],
    }));
  };

  const clearFilters = useCallback(() => {
    if (brandSlug) {
      router.replace(`/brands/${encodeURIComponent(brandSlug)}`, { scroll: false });
      onClose?.();
      return;
    }
    const basePath = pathname.startsWith("/product-category/") ? pathname : "/products";
    router.replace(basePath, { scroll: false });
    onClose?.();
  }, [pathname, router, onClose, brandSlug]);

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
            onClick={() => hasChildren && toggleCategory(slug)}
            className={`h-5 w-5 rounded text-xs ${hasChildren ? "text-gray-600 hover:bg-gray-100" : "text-transparent"}`}
            aria-label={hasChildren ? (isExpanded ? "Collapse category" : "Expand category") : "No children"}
          >
            {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
          </button>

          <button
            type="button"
            onClick={() => handleCategorySelect(slug)}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
              isActive
                ? "bg-teal-600 text-white font-semibold shadow-sm"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            style={{ marginLeft: `${level * 10}px` }}
          >
            <span className="truncate">{category.name}</span>
            {typeof category.count === "number" && (
              <span className={`ml-2 text-xs ${isActive ? "text-teal-100" : "text-gray-400"}`}>
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

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {brandSlug ? "Categories in this brand" : "Categories"}
          </h3>
          {!brandSlug && (
            <button
              type="button"
              onClick={() => setShowAllCategories((prev) => !prev)}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
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
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
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
                }`}
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
                    onClick={() => handleCategorySelect(cat.slug)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                      activeCategory === cat.slug
                        ? "bg-teal-600 text-white font-semibold shadow-sm"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {typeof cat.count === "number" && cat.count > 0 && (
                      <span
                        className={`ml-2 text-xs ${activeCategory === cat.slug ? "text-teal-100" : "text-gray-400"}`}
                      >
                        {cat.count}
                      </span>
                    )}
                  </button>
                ))
              )}
            </>
          ) : showAllCategories ? (
            rootCategorySlugs.map((slug) => renderTree(slug, 0))
          ) : (
            visibleCategoryRows.map(({ cat, level }) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => handleCategorySelect(cat.slug)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  activeCategory === cat.slug
                    ? "bg-teal-600 text-white font-semibold shadow-sm"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                style={{ marginLeft: `${level * 10}px` }}
              >
                <span className="truncate">{cat.name}</span>
                {typeof cat.count === "number" && (
                  <span className={`ml-2 text-xs ${activeCategory === cat.slug ? "text-teal-100" : "text-gray-400"}`}>
                    {cat.count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {!isShopPage && !isBrandContext && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Brands</h3>
          <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
            {categoryBrands.length === 0 && (
              <p className="text-sm text-gray-500">No brands found</p>
            )}
            {categoryBrands.map((b) => (
              <label
                key={b.slug}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
                  activeBrands.includes(b.slug)
                    ? "bg-gray-100 text-gray-900 font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeBrands.includes(b.slug)}
                  onChange={() => handleBrandToggle(b.slug)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>{b.name}</span>
                </div>
                {typeof b.count === "number" && (
                  <span className="text-xs text-gray-400">{b.count}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={clearFilters}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Clear all
      </button>
    </aside>
  );
}