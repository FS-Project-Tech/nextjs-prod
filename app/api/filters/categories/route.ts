import { NextRequest, NextResponse } from 'next/server';
import { fetchCategories, fetchCategoryBySlug } from '@/lib/woocommerce';
import { cached, CACHE_TTL, CACHE_TAGS } from '@/lib/cache';

/**
 * GET /api/filters/categories
 * Returns categories for the filter sidebar.
 * Cached so subcategory requests (and prefetch on hover) are fast.
 *
 * Query params:
 * - category: Parent category slug to get children for
 */
export async function GET(request: NextRequest) {
  try {
    const categorySlug = request.nextUrl.searchParams.get('category');
    const cacheKey = `filters:categories:${categorySlug || 'all'}`;
    const bypassCache = request.headers.get('cache-control')?.includes('no-cache');

    const result = await cached(
      cacheKey,
      async () => {
        if (categorySlug) {
          const parentCategory = await fetchCategoryBySlug(categorySlug);
          if (!parentCategory) {
            return { categories: [] };
          }
          const children = await fetchCategories({
            per_page: 100,
            parent: parentCategory.id,
            hide_empty: true,
          });
          return {
            categories: children.map((cat) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              count: cat.count,
            })),
          };
        }
        const categories = await fetchCategories({
          per_page: 100,
          parent: 0,
          hide_empty: true,
        });
        return {
          categories: categories.map((cat) => ({
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
    console.error('Error fetching filter categories:', (error instanceof Error ? error.message : 'An error occurred'));
    return NextResponse.json(
      { error: 'Failed to fetch categories', categories: [] },
      { status: 500 }
    );
  }
}


