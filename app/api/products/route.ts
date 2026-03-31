import { NextRequest, NextResponse } from 'next/server';
import { fetchProducts } from '@/lib/woocommerce';
import type { WooCommerceProduct } from '@/lib/woocommerce';
import {
  cached,
  productsKey,
  CACHE_TTL,
  CACHE_TAGS,
  PRODUCT_CACHE_HEADERS,
} from '@/lib/cache';
 
const isDev = process.env.NODE_ENV === 'development';
 
/* ================= SANITIZE ================= */
 
function sanitizeInput(input: string | null): string {
  if (!input) return '';
  return input
    .replace(/[<>'"`;\\]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .slice(0, 200);
}
 
function sanitizeNumber(
  input: string | null,
  min: number,
  max: number,
  defaultVal: number
): number {
  if (!input) return defaultVal;
  const num = parseInt(input, 10);
  if (isNaN(num)) return defaultVal;
  return Math.min(Math.max(num, min), max);
}
 
const MAX_INCLUDE_IDS = 100;
 
/** Parse comma-separated product IDs for WooCommerce `include` */
function parseIncludeParam(raw: string | null): number[] {
  if (!raw?.trim()) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const n = parseInt(part.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
    if (ids.length >= MAX_INCLUDE_IDS) break;
  }
  return ids;
}
 
/* ================= API ================= */
 
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
 
    const hasBrandFilter = !!searchParams.get('brands') || !!searchParams.get('brand');
    const bypassCache =
      searchParams.get('nocache') === '1' ||
      request.headers.get('cache-control')?.includes('no-cache') ||
      request.headers.get('x-bypass-cache') === 'true' ||
      hasBrandFilter;
 
    const params: Record<string, any> = {};
 
    /* ================= PARAMS ================= */
 
    params.per_page = sanitizeNumber(searchParams.get('per_page'), 1, 100, 24);
    params.page = sanitizeNumber(searchParams.get('page'), 1, 1000, 1);
 
    if (params.page > 100 && !searchParams.get('search')) {
      params.page = 100;
    }
 
    const categoryParam =
      searchParams.get('category') || searchParams.get('categorySlug');
    if (categoryParam) params.categorySlug = sanitizeInput(categoryParam);
 
    const categories = searchParams.get('categories');
    if (categories) params.categories = sanitizeInput(categories);
 
    const brands = searchParams.get('brand') || searchParams.get('brands');
    if (brands) params.brands = sanitizeInput(brands);
 
    const tags = searchParams.get('tags') || searchParams.get('tag');
    if (tags) params.tags = sanitizeInput(tags);
 
    const minPrice = searchParams.get('minPrice');
    if (minPrice && /^\d+(\.\d+)?$/.test(minPrice)) {
      params.minPrice = minPrice;
    }
 
    const maxPrice = searchParams.get('maxPrice');
    if (maxPrice && /^\d+(\.\d+)?$/.test(maxPrice)) {
      params.maxPrice = maxPrice;
    }
 
    const sortBy = searchParams.get('sortBy');
    const allowedSorts = [
      'price_low',
      'price_high',
      'newest',
      'popularity',
      'rating',
    ];
    if (sortBy && allowedSorts.includes(sortBy)) {
      params.sortBy = sortBy;
    }
 
    const search =
      searchParams.get('search') ||
      searchParams.get('query') ||
      searchParams.get('Search');
 
    if (search && search.trim()) {
      params.search = sanitizeInput(search).slice(0, 100);
    }
 
    if (searchParams.get('featured') === 'true') params.featured = true;
    if (searchParams.get('on_sale') === 'true') params.on_sale = true;
 
    if (params.search && (params.tags || params.brands)) {
      delete params.tags;
      delete params.brands;
    }
 
    const includeIds = parseIncludeParam(searchParams.get('include'));
    if (includeIds.length > 0) {
      params.include = includeIds;
      params.per_page = Math.min(
        100,
        Math.max(includeIds.length, params.per_page),
      );
      params.page = 1;
      // Avoid empty intersection with WC filters (wishlist only sends include + per_page)
      delete params.categorySlug;
      delete params.categories;
      delete params.brands;
      delete params.tags;
      delete params.search;
      delete params.featured;
      delete params.on_sale;
      delete params.minPrice;
      delete params.maxPrice;
      delete params.sortBy;
    }
 
    /* ================= CACHE KEY ================= */
 
    const stableParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);
 
    const cacheKey = productsKey(stableParams);
 
    /* ================= FETCH ================= */
 
    const result = await cached(
      cacheKey,
      async () => {
        const raw = await fetchProducts(stableParams);
 
        /* ================= 🚀 OPTIMIZED MAPPING ================= */
 
        const products = (raw?.products || []).map(
          (p: WooCommerceProduct) => {
            const price = p.price || "0";
            const regular = p.regular_price || "";
            const sale = p.sale_price || "";
 
            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              sku: p.sku || "",
 
              price,
              sale_price: sale,
              regular_price: regular,
              on_sale: p.on_sale || false,
 
              sale_percentage:
                regular && sale
                  ? Math.round(
                      ((Number(regular) - Number(sale)) / Number(regular)) *
                        100
                    )
                  : null,
 
              // ✅ FAST IMAGE (no heavy transform)
              image: p.images?.[0]?.src || "",
              image_alt: p.images?.[0]?.alt || p.name,
 
              average_rating: Number(p.average_rating || 0),
              rating_count: Number(p.rating_count || 0),
 
              tags: Array.isArray(p.tags)
                ? p.tags.map((t: any) => ({
                    id: t.id ?? 0,
                    name: t.name ?? "",
                    slug: t.slug ?? "",
                  }))
                : [],
            };
          }
        );
 
        return {
          products,
          total: raw?.total ?? 0,
          totalPages: raw?.totalPages ?? 1,
        };
      },
      {
        ttl: CACHE_TTL.PRODUCTS,
        tags: [CACHE_TAGS.PRODUCTS],
        skipCache: bypassCache,
      }
    );
 
    /* ================= RESPONSE ================= */
 
    return NextResponse.json(result, {
      headers: {
        ...PRODUCT_CACHE_HEADERS,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Content-Type': 'application/json',
        Vary: 'Accept-Encoding',
      },
    });
  } catch (error) {
    if (isDev) console.error('❌ /api/products error:', error);
 
    return NextResponse.json(
      {
        error: 'Unable to load products',
        products: [],
        total: 0,
        totalPages: 0,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}