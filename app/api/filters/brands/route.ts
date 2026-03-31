import { NextRequest, NextResponse } from 'next/server';
import wcAPI, { type WooCommerceProduct, fetchCategoryBySlug } from '@/lib/woocommerce';
import { getWpBaseUrl } from '@/lib/wp-utils';
import { cached, CACHE_TTL, CACHE_TAGS, STATIC_CACHE_HEADERS } from '@/lib/cache';
import { extractProductBrands } from '@/lib/utils/product';

const PER_PAGE = 100;
const MAX_PAGES = 50; // cap to avoid runaway (e.g. 5000 brands)

/** Fetch all brand terms from WordPress REST API (product_brand taxonomy) with pagination. */
async function fetchBrandsFromWpTaxonomy(): Promise<Array<{ id: number; name: string; slug: string; count?: number; image?: string | null }>> {
  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
  if (!base) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[api/filters/brands] No WordPress URL: set NEXT_PUBLIC_WP_URL or WC_API_URL (Vercel: add in Project Settings → Environment Variables).');
    }
    return [];
  }

  const taxonomySlugs = ['product_brand', 'pa_brand', 'brand'];
  for (const tax of taxonomySlugs) {
    const allTerms: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      try {
        const res = await fetch(
          `${base}/wp-json/wp/v2/${tax}?per_page=${PER_PAGE}&page=${page}&hide_empty=true`,
          { next: { revalidate: 3600 } }
        );
        if (!res.ok) break;
        const data = await res.json();
        const terms = Array.isArray(data) ? data : [];
        allTerms.push(...terms);
        const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
        hasMore = page < totalPages;
        page += 1;
      } catch {
        break;
      }
    }

    if (allTerms.length > 0) {
      return allTerms.map((term: any) => ({
        id: term.id,
        name: term.name || term.slug || '',
        slug: term.slug || '',
        count: typeof term.count === 'number' ? term.count : undefined,
        image: term.image?.url ?? term.acf?.image?.url ?? term.thumbnail ?? term.meta?.thumbnail_url ?? null,
      }));
    }
  }
  return [];
}

/** Build id->brand map from WordPress product_brand taxonomy (for category fallback). */
async function getWpBrandTermMap(
  base: string
): Promise<Map<number, { id: number; name: string; slug: string; image?: string | null }>> {
  const map = new Map<number, { id: number; name: string; slug: string; image?: string | null }>();
  const taxonomySlugs = ['product_brand', 'pa_brand', 'brand'];
  const maxPages = 2;
  for (const tax of taxonomySlugs) {
    let page = 1;
    const perPage = 100;
    while (page <= maxPages) {
      const res = await fetch(
        `${base}/wp-json/wp/v2/${tax}?per_page=${perPage}&page=${page}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const terms = Array.isArray(data) ? data : [];
      terms.forEach((t: any) => {
        if (t.id != null) {
          map.set(Number(t.id), {
            id: Number(t.id),
            name: t.name || t.slug || '',
            slug: t.slug || '',
            image: t.image?.url ?? t.thumbnail ?? null,
          });
        }
      });
      if (terms.length < perPage) break;
      page += 1;
    }
    if (map.size > 0) return map;
  }
  return map;
}

const CATEGORY_BRANDS_WP_MAX_PAGES = 3;
const CATEGORY_BRANDS_WC_MAX_PAGES = 3;

/** Fetch brands that actually have products within a specific category slug. Optimized: try WP taxonomy first (fewer requests), then WC with limited pages. */
async function fetchBrandsForCategorySlug(
  categorySlug: string
): Promise<Array<{ id: number; name: string; slug: string; count?: number; image?: string | null }>> {
  const category = await fetchCategoryBySlug(categorySlug).catch(() => null);
  if (!category || !category.id) return [];

  const categoryId = category.id;
  const brandMap = new Map<string, { id: number; name: string; slug: string; count?: number; image?: string | null }>();

  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();

  // 1) Try WordPress REST API first (product_brand taxonomy) – usually 1 term map + few product pages; faster when WC doesn't return brands
  if (base) {
    const brandTermMap = await getWpBrandTermMap(base);
    if (brandTermMap.size > 0) {
      const taxonomySlugs = ['product_brand', 'pa_brand', 'brand'];
      for (const tax of taxonomySlugs) {
        for (let wpPage = 1; wpPage <= CATEGORY_BRANDS_WP_MAX_PAGES; wpPage++) {
          const wpRes = await fetch(
            `${base}/wp-json/wp/v2/product?product_cat=${categoryId}&per_page=100&page=${wpPage}`,
            { next: { revalidate: 300 } }
          );
          if (!wpRes.ok) break;
          const posts: any[] = await wpRes.json();
          if (posts.length === 0) break;
          posts.forEach((p: any) => {
            const brandIds = p[tax];
            if (Array.isArray(brandIds)) {
              brandIds.forEach((id: number) => {
                const term = brandTermMap.get(Number(id));
                if (term) {
                  const key = (term.slug || term.name || '').toLowerCase().replace(/\s+/g, '-');
                  if (key && !brandMap.has(key)) {
                    brandMap.set(key, {
                      id: term.id,
                      name: term.name,
                      slug: term.slug,
                      count: undefined,
                      image: term.image ?? null,
                    });
                  }
                }
              });
            }
          });
          if (posts.length < 100) break;
        }
        if (brandMap.size > 0) break;
      }
    }
  }

  // 2) Fallback: WooCommerce products in category (limited pages to keep response time low)
  if (brandMap.size === 0) {
    for (let page = 1; page <= CATEGORY_BRANDS_WC_MAX_PAGES; page++) {
      const res = await wcAPI.get('/products', {
        params: { category: categoryId, per_page: 100, page },
      });
      const products: WooCommerceProduct[] = res.data || [];
      if (products.length === 0) break;
      products.forEach((product) => {
        const brands = extractProductBrands(product);
        brands.forEach((b) => {
          const key = (b.slug || b.name || '').toLowerCase().replace(/\s+/g, '-');
          if (!key) return;
          if (brandMap.has(key)) return;
          brandMap.set(key, {
            id: typeof b.id === 'number' ? b.id : 0,
            name: b.name || b.slug || '',
            slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-'),
            count: undefined,
            image: b.image || null,
          });
        });
      });
      if (products.length < 100) break;
    }
  }

  return Array.from(brandMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * GET /api/filters/brands
 * Returns brands for the filter sidebar and /brands page.
 *
 * Uses WordPress taxonomy (WooCommerce → Products → Brands) first so all brands show;
 * falls back to product attribute terms if taxonomy is not available.
 *
 * Query params:
 * - category: Optional category slug to get brands for specific category
 */
export async function GET(request: NextRequest) {
  try {
    const categorySlug = request.nextUrl.searchParams.get('category');
    const cacheKey = `brands:${categorySlug || 'all'}`;

    // Check for cache bypass
    const bypassCache = request.headers.get('cache-control')?.includes('no-cache');

    // Fetch brands with caching
    const brands = await cached(
      cacheKey,
      async () => {
        // 0) If a category is specified, return only brands that have products in that category
        if (categorySlug) {
          const categoryBrands = await fetchBrandsForCategorySlug(categorySlug);
          return categoryBrands;
        }

        // 1) Try WordPress REST API taxonomy (WooCommerce → Products → Brands) – all brands
        const wpBrands = await fetchBrandsFromWpTaxonomy();
        if (wpBrands.length > 0) return wpBrands;

        // 2) Fallback: product attribute terms (per_page 100, then paginate to get more)
        try {
          const response = await wcAPI.get('/products/attributes');
          const attributes = response.data || [];

          const brandAttribute = attributes.find((attr: any) =>
            attr.slug === 'product_brand' ||
            attr.slug === 'brand' ||
            attr.name?.toLowerCase() === 'brand'
          );

          if (brandAttribute) {
            const allTerms: any[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore && page <= MAX_PAGES) {
              const termsResponse = await wcAPI.get(`/products/attributes/${brandAttribute.id}/terms`, {
                params: { per_page: PER_PAGE, page, hide_empty: true },
              });
              const list = termsResponse.data || [];
              allTerms.push(...list);
              hasMore = list.length === PER_PAGE;
              page += 1;
            }
            return allTerms.map((brand: any) => ({
              id: brand.id,
              name: brand.name,
              slug: brand.slug,
              count: brand.count,
              image: brand.image?.src ?? brand.thumbnail ?? brand.image ?? null,
            }));
          }
        } catch {
          // ignore
        }

        return [];
      },
      {
        ttl: CACHE_TTL.BRANDS,
        tags: [CACHE_TAGS.BRANDS],
        skipCache: bypassCache,
      }
    );
    
    return NextResponse.json({ brands }, {
      headers: {
        ...STATIC_CACHE_HEADERS,
        'X-Cache-Key': cacheKey,
      },
    });
    
  } catch (error) {
    console.error('Error fetching brands:', (error instanceof Error ? error.message : 'An error occurred'));
    return NextResponse.json(
      { error: 'Failed to fetch brands', brands: [] },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}


