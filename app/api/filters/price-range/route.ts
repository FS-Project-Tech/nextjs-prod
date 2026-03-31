import { NextRequest, NextResponse } from 'next/server';
import wcAPI from '@/lib/woocommerce';
import { cached, CACHE_TTL, CACHE_TAGS, STATIC_CACHE_HEADERS } from '@/lib/cache';

/**
 * GET /api/filters/price-range
 * Returns min and max price for the price filter slider
 * 
 * Query params:
 * - category: Optional category slug to get price range for specific category
 */
export async function GET(request: NextRequest) {
  try {
    const categorySlug = request.nextUrl.searchParams.get('category');
    const cacheKey = `price-range:${categorySlug || 'all'}`;
    
    // Check for cache bypass
    const bypassCache = request.headers.get('cache-control')?.includes('no-cache');
    
    // Fetch price range with caching (prices don't change frequently)
    const priceRange = await cached(
      cacheKey,
      async () => {
        // Build params for WooCommerce request
        const params: Record<string, any> = {
          per_page: 1,
          orderby: 'price',
        };
        
        // If category specified, we'd need to resolve it to ID
        // For simplicity, we'll get global price range
        
        // Get cheapest and most expensive products in parallel
        const [minResponse, maxResponse] = await Promise.all([
          wcAPI.get('/products', {
            params: { ...params, order: 'asc', status: 'publish' },
          }),
          wcAPI.get('/products', {
            params: { ...params, order: 'desc', status: 'publish' },
          }),
        ]);
        
        const minProduct = minResponse.data?.[0];
        const maxProduct = maxResponse.data?.[0];
        
        const minPrice = minProduct ? parseFloat(minProduct.price || '0') : 0;
        const maxPrice = maxProduct ? parseFloat(maxProduct.price || '1000') : 1000;
        
        return {
          min: Math.floor(minPrice),
          max: Math.ceil(maxPrice),
        };
      },
      {
        ttl: CACHE_TTL.STATIC, // Price ranges don't change often
        tags: [CACHE_TAGS.PRODUCTS],
        skipCache: bypassCache,
      }
    );
    
    return NextResponse.json(priceRange, {
      headers: {
        ...STATIC_CACHE_HEADERS,
        'X-Cache-Key': cacheKey,
      },
    });
  } catch (error) {
    console.error('Error fetching price range:', (error instanceof Error ? error.message : 'An error occurred'));
    // Return default range on error
    return NextResponse.json({
      min: 0,
      max: 1000,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
}


