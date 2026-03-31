/**
 * API Route Caching Utilities
 * 
 * Provides easy-to-use wrappers for caching API responses in Next.js routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  cached,
  responseCache,
  getCacheHeaders,
  CACHE_TTL,
  CACHE_TAGS,
  type CacheOptions,
  type CacheHeaders,
} from './index';

// ============================================================================
// Types
// ============================================================================

export interface ApiCacheOptions extends CacheOptions {
  /** HTTP cache headers options */
  httpCache?: {
    maxAge?: number;
    sMaxAge?: number;
    staleWhileRevalidate?: number;
    private?: boolean;
    noStore?: boolean;
  };
  /** Generate cache key from request */
  keyGenerator?: (request: NextRequest) => string;
  /** Should this request be cached? */
  shouldCache?: (request: NextRequest) => boolean;
}

export interface CachedApiResponse<T = any> {
  data: T;
  cached: boolean;
  timestamp: number;
}

// ============================================================================
// API Cache Wrapper
// ============================================================================

/**
 * Wrap an API route handler with caching
 * 
 * @example
 * ```ts
 * export const GET = withApiCache(
 *   async (request) => {
 *     const products = await fetchProducts();
 *     return { products };
 *   },
 *   {
 *     ttl: CACHE_TTL.PRODUCTS,
 *     tags: [CACHE_TAGS.PRODUCTS],
 *     keyGenerator: (req) => `products:${req.nextUrl.search}`,
 *   }
 * );
 * ```
 */
export function withApiCache<T>(
  handler: (request: NextRequest) => Promise<T>,
  options: ApiCacheOptions = {}
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const {
      ttl = CACHE_TTL.PRODUCTS,
      tags = [],
      httpCache,
      keyGenerator,
      shouldCache,
      ...cacheOptions
    } = options;

    // Check if request should be cached
    if (shouldCache && !shouldCache(request)) {
      const data = await handler(request);
      return createResponse(data, false, {
        'Cache-Control': 'no-store',
      });
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(request)
      : `api:${request.nextUrl.pathname}${request.nextUrl.search}`;

    // Check if client wants fresh data
    const noCache = request.headers.get('cache-control')?.includes('no-cache');
    const forceRefresh = noCache || cacheOptions.forceRefresh;

    try {
      // Attempt to get cached response
      let wasCached = false;
      
      const data = await cached<T>(
        cacheKey,
        async () => {
          const result = await handler(request);
          return result;
        },
        {
          ttl,
          tags,
          forceRefresh,
          ...cacheOptions,
        }
      );

      // Check if response came from cache
      const cacheEntry = responseCache.get(cacheKey);
      wasCached = cacheEntry !== null && !forceRefresh;

      // Generate HTTP cache headers
      const headers = httpCache
        ? getCacheHeaders(httpCache)
        : getCacheHeaders({
            maxAge: Math.min(ttl, 60), // Browser cache max 1 min
            sMaxAge: ttl,
            staleWhileRevalidate: ttl * 2,
          });

      return createResponse(data, wasCached, headers);
    } catch (error) {
      console.error(`[API Cache] Error for ${cacheKey}:`, error);
      throw error;
    }
  };
}

/**
 * Create a NextResponse with caching metadata
 */
function createResponse<T>(
  data: T,
  cached: boolean,
  headers: CacheHeaders
): NextResponse {
  const response: CachedApiResponse<T> = {
    data,
    cached,
    timestamp: Date.now(),
  };

  // If data already has a specific structure, preserve it
  const body = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? { ...data as object, _cached: cached, _timestamp: Date.now() }
    : data;

  return NextResponse.json(body, {
    headers: {
      ...headers,
      'X-Cache': cached ? 'HIT' : 'MISS',
      'X-Cache-Timestamp': String(Date.now()),
    },
  });
}

// ============================================================================
// Simple Caching Helpers
// ============================================================================

/**
 * Cache a simple async function result
 */
export async function cacheResult<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.PRODUCTS,
  tags: string[] = []
): Promise<T> {
  return cached(key, fetcher, { ttl, tags });
}

/**
 * Get products with caching
 */
export async function getCachedProducts<T>(
  params: Record<string, any>,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = `products:${JSON.stringify(params)}`;
  return cached(key, fetcher, {
    ttl: CACHE_TTL.PRODUCTS,
    tags: [CACHE_TAGS.PRODUCTS],
  });
}

/**
 * Get categories with caching
 */
export async function getCachedCategories<T>(
  params: Record<string, any>,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = `categories:${JSON.stringify(params)}`;
  return cached(key, fetcher, {
    ttl: CACHE_TTL.CATEGORIES,
    tags: [CACHE_TAGS.CATEGORIES],
  });
}

/**
 * Get single product with caching
 */
export async function getCachedProduct<T>(
  idOrSlug: string | number,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = `product:${idOrSlug}`;
  return cached(key, fetcher, {
    ttl: CACHE_TTL.PRODUCTS,
    tags: [CACHE_TAGS.PRODUCTS, `product:${idOrSlug}`],
  });
}

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Extract cache key from request search params
 */
export function getSearchParamsKey(request: NextRequest): string {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

/**
 * Check if request should bypass cache
 */
export function shouldBypassCache(request: NextRequest): boolean {
  // Check Cache-Control header
  const cacheControl = request.headers.get('cache-control');
  if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
    return true;
  }

  // Check custom header
  if (request.headers.get('x-bypass-cache') === 'true') {
    return true;
  }

  // POST, PUT, DELETE should not use cached responses
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    return true;
  }

  return false;
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a cached response with proper headers
 */
export function cachedResponse<T>(
  data: T,
  options: {
    ttl?: number;
    private?: boolean;
    revalidate?: number;
  } = {}
): NextResponse {
  const { ttl = 60, private: isPrivate = false, revalidate } = options;

  const headers = getCacheHeaders({
    maxAge: Math.min(ttl, 60),
    sMaxAge: ttl,
    staleWhileRevalidate: revalidate ?? ttl * 2,
    private: isPrivate,
  });

  const normalizedHeaders: HeadersInit = headers as unknown as Record<string, string>;
  return NextResponse.json(data, { headers: normalizedHeaders });
}

/**
 * Create a non-cached response
 */
export function noCacheResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}

// ============================================================================
// Exports
// ============================================================================

export {
  CACHE_TTL,
  CACHE_TAGS,
  getCacheHeaders,
  responseCache,
};

