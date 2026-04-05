"use client";

import { useEffect, useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { fetchUnifiedCategoriesClient } from "@/lib/client-unified-categories";

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
                  className="h-4 w-4 text-gray-600 group-hover:text-teal-600 transition-colors flex-shrink-0"
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

  // Single unified /api/categories load (deduped across app via client cache)
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const payload = await fetchUnifiedCategoriesClient();
        if (cancelled) return;

        const parentCats: WCCategory[] = payload.roots
          .filter((c) => c.count > 0)
          .map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent: 0,
          }));

        const map: Record<number, WCCategory[]> = {};
        Object.entries(payload.childrenByParentId).forEach(([pid, children]) => {
          const parentId = parseInt(pid, 10);
          if (!parentId) return;
          map[parentId] = children.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent: parentId,
          }));
        });

        if (!cancelled) {
          setCategories(parentCats);
          setChildrenMap(map);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleCategoryClick = useCallback(
    (category: WCCategory) => {
      const existingSubcategories = childrenMap[category.id];
      const hasSubcategories = existingSubcategories && existingSubcategories.length > 0;

      if (hasSubcategories) {
        setSelectedCategory(category);
        setSubcategories(existingSubcategories);
        setSubcategoryDrawerOpen(true);
        setLoadingSubcategories(false);
        return;
      }

      setSubcategoryDrawerOpen(false);
      setDrawerOpen(false);
      router.push(`/product-category/${category.slug}`);
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
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <h3 className="text-base font-semibold text-gray-900">Browse Categories</h3>
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
                  <div className="p-4 text-sm text-gray-600">No subcategories found.</div>
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
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="p-4 text-sm text-gray-600">No subcategories found.</div>
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
                  <h3 className="text-base font-semibold text-gray-900">Shop by Category</h3>
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
