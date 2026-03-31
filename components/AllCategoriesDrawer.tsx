"use client";

import { useEffect, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";

interface WCCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

interface CategoryListProps {
  categories: WCCategory[];
  childrenMap: Record<number, WCCategory[]>;
  onCategoryClick: (category: WCCategory) => void;
}

const CategoryList = memo(function CategoryList({
  categories,
  childrenMap,
  onCategoryClick,
}: CategoryListProps) {
  return (
    <ul className="space-y-0">
      {categories.map((cat) => {
        const hasSubcategories = childrenMap[cat.id] && childrenMap[cat.id].length > 0;

        return (
          <li key={cat.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCategoryClick(cat);
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors group"
            >
              <span className="font-medium text-left">{cat.name}</span>
              {hasSubcategories && (
                <svg
                  className="h-4 w-4 text-gray-400 group-hover:text-teal-600 transition-colors flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

export default function AllCategoriesDrawer({
  className = "",
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<WCCategory[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<number, WCCategory[]>>({});
  const [subcategoryDrawerOpen, setSubcategoryDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<WCCategory | null>(null);
  const [subcategories, setSubcategories] = useState<WCCategory[]>([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);
  const router = useRouter();
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;
  const setDrawerOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  // Fetch all categories and build children map
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const fetchCategories = async () => {
      setLoading(true);
      try {
        // Fetch both parent and all categories in parallel
        const [parentRes, allRes] = await Promise.all([
          fetch("/api/categories?per_page=100&parent=0&hide_empty=true", {
            cache: "force-cache",
          }),
          fetch("/api/categories?per_page=200&hide_empty=false", {
            cache: "force-cache",
          }),
        ]);

        if (cancelled) return;

        let parentCats: WCCategory[] = [];
        let allCats: WCCategory[] = [];

        if (parentRes.ok) {
          const data = await parentRes.json();
          parentCats = Array.isArray(data) ? data : data.categories || [];
        }

        if (allRes.ok) {
          const data = await allRes.json();
          allCats = Array.isArray(data) ? data : data.categories || [];
        }

        if (cancelled) return;

        // Build children map from all categories
        const map: Record<number, WCCategory[]> = {};
        allCats.forEach((cat: any) => {
          // Ensure parent is a number and not 0
          const parentId = typeof cat.parent === "number" ? cat.parent : parseInt(cat.parent, 10);
          if (parentId && parentId > 0) {
            map[parentId] = map[parentId] || [];
            map[parentId].push({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              parent: parentId,
            });
          }
        });

        if (!cancelled) {
          setCategories(parentCats);
          setChildrenMap(map);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        if (!cancelled) {
          setCategories([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchCategories();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Handle category click - Amazon style
  const handleCategoryClick = useCallback(
    async (category: WCCategory) => {
      // Check if category has subcategories in the map
      const existingSubcategories = childrenMap[category.id];
      const hasSubcategories = existingSubcategories && existingSubcategories.length > 0;

      if (hasSubcategories) {
        // Category has subcategories - open drawer, DO NOT navigate
        setSelectedCategory(category);
        setSubcategories(existingSubcategories);
        setSubcategoryDrawerOpen(true);
        setLoadingSubcategories(false);
        return; // Important: return early to prevent navigation
      }

      // No subcategories in map - check by fetching
      setSelectedCategory(category);
      setLoadingSubcategories(true);
      setSubcategoryDrawerOpen(true); // Open drawer first to show loading

      try {
        const res = await fetch(
          `/api/categories?per_page=100&parent=${category.id}&hide_empty=true`,
          { cache: "force-cache" }
        );
        
        if (res.ok) {
          const data = await res.json();
          const children = Array.isArray(data) ? data : data.categories || [];

          if (children.length > 0) {
            // Found subcategories - show them in drawer, DO NOT navigate
            const normalizedChildren: WCCategory[] = children.map((cat: any) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              parent: category.id,
            }));

            setSubcategories(normalizedChildren);
            
            // Update children map for future use
            setChildrenMap((prev) => ({
              ...prev,
              [category.id]: normalizedChildren,
            }));
          } else {
            // No subcategories found - close drawer and navigate
            setSubcategoryDrawerOpen(false);
            setDrawerOpen(false);
            router.push(`/product-category/${category.slug}`);
            return;
          }
        } else {
          // API error - close drawer and navigate
          setSubcategoryDrawerOpen(false);
          setDrawerOpen(false);
          router.push(`/product-category/${category.slug}`);
          return;
        }
      } catch (error) {
        console.error("Error fetching subcategories:", error);
        // On error - close drawer and navigate
        setSubcategoryDrawerOpen(false);
        setDrawerOpen(false);
        router.push(`/product-category/${category.slug}`);
        return;
      } finally {
        setLoadingSubcategories(false);
      }
    },
    [childrenMap, router, setDrawerOpen]
  );

  const handleSubcategoryClick = (subcategory: WCCategory) => {
    setDrawerOpen(false);
    setSubcategoryDrawerOpen(false);
    setSelectedCategory(null);
    router.push(`/product-category/${subcategory.slug}`);
  };

  const handleBackToCategories = () => {
    setSubcategoryDrawerOpen(false);
    setSelectedCategory(null);
    setSubcategories([]);
  };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`inline-flex items-center gap-2 ${className}`}
          aria-label="Browse all categories"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="font-medium">All Categories</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setDrawerOpen(false);
              setSubcategoryDrawerOpen(false);
              setSelectedCategory(null);
            }}
          />

          {/* Mobile bottom sheet */}
          <div className="md:hidden absolute left-0 right-0 bottom-0 h-[80vh] max-h-[90vh] rounded-t-2xl bg-white shadow-2xl">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 my-3" />
            <div className="flex items-center justify-between border-b px-4 py-3">
              {subcategoryDrawerOpen ? (
                <>
                  <button
                    onClick={handleBackToCategories}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    <h3 className="text-base font-semibold text-gray-900">
                      {selectedCategory?.name}
                    </h3>
                  </button>
                </>
              ) : (
                <h3 className="text-base font-semibold text-gray-900">
                  Browse Categories
                </h3>
              )}
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setSubcategoryDrawerOpen(false);
                  setSelectedCategory(null);
                }}
                className="rounded p-2 text-gray-600 hover:bg-gray-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(100%-64px)] overflow-y-auto">
              {subcategoryDrawerOpen ? (
                loadingSubcategories ? (
                  <div className="p-4 text-sm text-gray-600">Loading...</div>
                ) : subcategories.length === 0 ? (
                  <div className="p-4 text-sm text-gray-600">
                    No subcategories found.
                  </div>
                ) : (
                  <ul className="space-y-0">
                    {subcategories.map((sub) => (
                      <li key={sub.id} className="border-b border-gray-100 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => handleSubcategoryClick(sub)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                        >
                          {sub.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : loading ? (
                <div className="p-4 text-sm text-gray-600">Loading...</div>
              ) : categories.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">No categories found.</div>
              ) : (
                <CategoryList
                  categories={categories}
                  childrenMap={childrenMap}
                  onCategoryClick={handleCategoryClick}
                />
              )}
            </div>
          </div>

          {/* Desktop left drawer - Amazon Style */}
          <div className="hidden md:block absolute left-0 top-0 h-full w-[380px] bg-white shadow-2xl">
            {/* Subcategory Drawer (slides in from right) */}
            {subcategoryDrawerOpen && (
              <div className="absolute inset-0 bg-white z-10">
                <div className="flex items-center gap-3 border-b bg-gray-50 px-4 py-3">
                  <button
                    onClick={handleBackToCategories}
                    className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                    aria-label="Back to categories"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <h3 className="text-base font-semibold text-gray-900 flex-1">
                    {selectedCategory?.name}
                  </h3>
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      setSubcategoryDrawerOpen(false);
                      setSelectedCategory(null);
                    }}
                    className="rounded p-1.5 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="h-[calc(100%-57px)] overflow-y-auto">
                  {loadingSubcategories ? (
                    <div className="p-4 text-sm text-gray-600">Loading...</div>
                  ) : subcategories.length === 0 ? (
                    <div className="p-4 text-sm text-gray-600">
                      No subcategories found.
                    </div>
                  ) : (
                    <ul className="space-y-0">
                      {subcategories.map((sub) => (
                        <li key={sub.id} className="border-b border-gray-100 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => handleSubcategoryClick(sub)}
                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors font-medium"
                          >
                            {sub.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Main Categories Drawer */}
            {!subcategoryDrawerOpen && (
              <>
                <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
                  <h3 className="text-base font-semibold text-gray-900">
                    Shop by Category
                  </h3>
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      setSubcategoryDrawerOpen(false);
                      setSelectedCategory(null);
                    }}
                    className="rounded p-1.5 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="h-[calc(100%-57px)] overflow-y-auto">
                  {loading ? (
                    <div className="p-4 text-sm text-gray-600">Loading...</div>
                  ) : categories.length === 0 ? (
                    <div className="p-4 text-sm text-gray-600">No categories found.</div>
                  ) : (
                    <CategoryList
                      categories={categories}
                      childrenMap={childrenMap}
                      onCategoryClick={handleCategoryClick}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}