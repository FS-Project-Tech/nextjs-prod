import { NextRequest, NextResponse } from "next/server";
import {
  getUnifiedCategories,
  findCategoryBySlug,
  getChildrenForParent,
  getRootCategoriesNonEmpty,
} from "@/lib/categories-unified";
import { cached, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";

/**
 * GET /api/filters/categories?category=slug
 * Slices the unified category tree (no extra WooCommerce calls).
 */
export async function GET(request: NextRequest) {
  try {
    const categorySlug = request.nextUrl.searchParams.get("category");
    const bypassCache = request.headers.get("cache-control")?.includes("no-cache");

    const cacheKey = `filters:categories:v2:${categorySlug || "roots"}`;

    const result = await cached(
      cacheKey,
      async () => {
        const unified = await getUnifiedCategories({ skipCache: bypassCache });

        if (categorySlug) {
          const parent = findCategoryBySlug(unified, categorySlug);
          if (!parent) {
            return {
              categories: [] as { id: number; name: string; slug: string; count: number }[],
            };
          }
          const children = getChildrenForParent(unified, parent.id, { hideEmpty: true });
          return {
            categories: children.map((cat) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              count: cat.count,
            })),
          };
        }

        const roots = getRootCategoriesNonEmpty(unified);
        return {
          categories: roots.map((cat) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            count: cat.count,
          })),
        };
      },
      {
        ttl: CACHE_TTL.CATEGORIES,
        tags: [CACHE_TAGS.CATEGORIES],
        skipCache: bypassCache,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Error fetching filter categories:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Failed to fetch categories", categories: [] },
      { status: 500 }
    );
  }
}
