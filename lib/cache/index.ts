/**
 * Response Layer Caching System for Next.js
 * 
 * Features:
 * - In-memory cache with TTL (Time-To-Live)
 * - Tag-based cache invalidation
 * - Stale-while-revalidate pattern
 * - Request deduplication
 * - Size-based eviction (LRU)
 */

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt: number;
  tags: string[];
  staleAt?: number;
}

export interface CacheOptions {
  /** TTL in seconds (default: 60) */
  ttl?: number;
  /** Stale-while-revalidate window in seconds (default: ttl * 2) */
  swr?: number;
  /** Cache tags for invalidation */
  tags?: string[];
  /** Skip cache and fetch fresh data */
  skipCache?: boolean;
  /** Force cache refresh */
  forceRefresh?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  size: number;
  keys: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TTL = 60; // 1 minute
const MAX_CACHE_SIZE = 500; // Maximum entries
const MAX_CACHE_MEMORY = 50 * 1024 * 1024; // 50MB approximate limit

// Predefined TTLs for different data types
export const CACHE_TTL = {
  // Short-lived (30 seconds)
  CART: 30,
  SESSION: 30,
  
  // Medium (2 minutes)
  PRODUCTS: 120,
  SEARCH: 120,
  
  // Long (10 minutes)
  CATEGORIES: 600,
  BRANDS: 600,
  
  // Very long (1 hour)
  STATIC: 3600,
  CMS: 3600,
  
  // Permanent until invalidated (24 hours)
  PERMANENT: 86400,
} as const;

// Cache tags for invalidation
export const CACHE_TAGS = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  BRANDS: 'brands',
  CMS: 'cms',
  USER: 'user',
  CART: 'cart',
  ORDERS: 'orders',
} as const;

// ============================================================================
// Cache Store
// ============================================================================

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> keys
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    size: 0,
    keys: 0,
  };
  private pendingRequests = new Map<string, Promise<any>>();

  /**
   * Get cached data
   */
  get<T>(key: string): { data: T; isStale: boolean } | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    // Entry has expired and is past SWR window
    if (now > entry.expiresAt && (!entry.staleAt || now > entry.staleAt)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Entry is stale but within SWR window
    if (now > entry.expiresAt && entry.staleAt && now <= entry.staleAt) {
      this.stats.staleHits++;
      return { data: entry.data as T, isStale: true };
    }

    // Entry is fresh
    this.stats.hits++;
    return { data: entry.data as T, isStale: false };
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const { ttl = DEFAULT_TTL, swr, tags = [] } = options;
    const now = Date.now();

    // Check cache size and evict if necessary
    this.evictIfNecessary();

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl * 1000,
      staleAt: swr ? now + (ttl + swr) * 1000 : now + ttl * 2000,
      tags,
    };

    this.cache.set(key, entry);
    this.stats.keys = this.cache.size;

    // Update tag index
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }

    // Estimate size (rough approximation)
    this.stats.size += this.estimateSize(data);
  }

  /**
   * Delete cached entry
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Remove from tag index
    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(key);
    }

    this.cache.delete(key);
    this.stats.keys = this.cache.size;
    return true;
  }

  /**
   * Invalidate by tag
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) count++;
    }
    
    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * Invalidate by tag pattern
   */
  invalidateByTagPattern(pattern: RegExp): number {
    let count = 0;
    for (const [tag] of this.tagIndex) {
      if (pattern.test(tag)) {
        count += this.invalidateByTag(tag);
      }
    }
    return count;
  }

  /**
   * Invalidate all cache
   */
  invalidateAll(): void {
    this.cache.clear();
    this.tagIndex.clear();
    this.stats.keys = 0;
    this.stats.size = 0;
  }

  /**
   * Get pending request (for deduplication)
   */
  getPending<T>(key: string): Promise<T> | null {
    return this.pendingRequests.get(key) as Promise<T> | null;
  }

  /**
   * Set pending request
   */
  setPending<T>(key: string, promise: Promise<T>): void {
    this.pendingRequests.set(key, promise);
    // Clean up when done
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Evict oldest entries if cache is too large
   */
  private evictIfNecessary(): void {
    if (this.cache.size < MAX_CACHE_SIZE) return;

    // Simple LRU: delete oldest entries
    const entriesToDelete = Math.floor(MAX_CACHE_SIZE * 0.2); // Remove 20%
    let deleted = 0;

    for (const [key, entry] of this.cache) {
      if (deleted >= entriesToDelete) break;
      
      // Only delete expired or old entries
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        deleted++;
      }
    }

    // If still too large, delete oldest
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < entriesToDelete && i < keys.length; i++) {
        this.delete(keys[i]);
      }
    }
  }

  /**
   * Rough estimate of data size
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // UTF-16 encoding
    } catch {
      return 1024; // Default 1KB for non-serializable
    }
  }
}

// Singleton instance
export const responseCache = new ResponseCache();

// ============================================================================
// Cache Wrapper Function
// ============================================================================

/**
 * Cached fetch wrapper with SWR pattern
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { skipCache, forceRefresh } = options;

  // Skip cache entirely
  if (skipCache) {
    return fetcher();
  }

  // Check for pending request (deduplication)
  const pending = responseCache.getPending<T>(key);
  if (pending && !forceRefresh) {
    return pending;
  }

  // Check cache
  const cached = !forceRefresh ? responseCache.get<T>(key) : null;

  if (cached && !cached.isStale) {
    // Fresh cache hit
    return cached.data;
  }

  // Create fetch promise
  const fetchPromise = fetcher().then((data) => {
    responseCache.set(key, data, options);
    return data;
  }).catch((error) => {
    // On error, return stale data if available
    if (cached?.data) {
      console.warn(`[Cache] Fetch failed, returning stale data for ${key}`);
      return cached.data;
    }
    throw error;
  });

  // Register pending request
  responseCache.setPending(key, fetchPromise);

  // If we have stale data, return it immediately while revalidating
  if (cached?.isStale) {
    // Background revalidation
    fetchPromise.catch(() => {}); // Ignore background errors
    return cached.data;
  }

  return fetchPromise;
}

// ============================================================================
// Cache Key Generators
// ============================================================================

/**
 * Generate cache key for products
 */
export function productsKey(params: Record<string, any>): string {
  const normalized = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `products:${normalized || 'default'}`;
}

/**
 * Generate cache key for categories
 */
export function categoriesKey(params: Record<string, any>): string {
  const normalized = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== null)
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `categories:${normalized || 'all'}`;
}

/**
 * Generate cache key for product by ID or slug
 */
export function productKey(idOrSlug: string | number): string {
  return `product:${idOrSlug}`;
}

/**
 * Generate cache key for search results
 */
export function searchKey(query: string, params: Record<string, any> = {}): string {
  const normalized = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== null)
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `search:${query}:${normalized}`;
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

/**
 * Invalidate product-related caches
 */
export function invalidateProducts(): void {
  responseCache.invalidateByTag(CACHE_TAGS.PRODUCTS);
}

/**
 * Invalidate category-related caches
 */
export function invalidateCategories(): void {
  responseCache.invalidateByTag(CACHE_TAGS.CATEGORIES);
}

/**
 * Invalidate user-related caches
 */
export function invalidateUser(userId?: string | number): void {
  if (userId) {
    responseCache.invalidateByTagPattern(new RegExp(`^user:${userId}`));
  } else {
    responseCache.invalidateByTag(CACHE_TAGS.USER);
  }
}

/**
 * Invalidate all caches
 */
export function invalidateAll(): void {
  responseCache.invalidateAll();
}

// ============================================================================
// Response Headers for HTTP Caching
// ============================================================================

export interface CacheHeaders {
  'Cache-Control': string;
  'CDN-Cache-Control'?: string;
  'Vercel-CDN-Cache-Control'?: string;
  'Surrogate-Control'?: string;
}

/**
 * Generate HTTP cache headers
 */
export function getCacheHeaders(options: {
  /** Max age in seconds for browsers */
  maxAge?: number;
  /** s-maxage for CDN/proxy caches */
  sMaxAge?: number;
  /** Stale-while-revalidate window */
  staleWhileRevalidate?: number;
  /** Should browsers revalidate */
  mustRevalidate?: boolean;
  /** Is this private (user-specific) data? */
  private?: boolean;
  /** No caching at all */
  noStore?: boolean;
}): CacheHeaders {
  const {
    maxAge = 0,
    sMaxAge,
    staleWhileRevalidate,
    mustRevalidate = false,
    private: isPrivate = false,
    noStore = false,
  } = options;

  if (noStore) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };
  }

  const directives: string[] = [];

  // Visibility
  directives.push(isPrivate ? 'private' : 'public');

  // Browser max-age
  if (maxAge > 0) {
    directives.push(`max-age=${maxAge}`);
  }

  // CDN s-maxage
  if (sMaxAge !== undefined && sMaxAge > 0) {
    directives.push(`s-maxage=${sMaxAge}`);
  }

  // Stale-while-revalidate
  if (staleWhileRevalidate && staleWhileRevalidate > 0) {
    directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
  }

  // Must revalidate
  if (mustRevalidate) {
    directives.push('must-revalidate');
  }

  const cacheControl = directives.join(', ');

  const headers: CacheHeaders = {
    'Cache-Control': cacheControl,
  };

  // CDN-specific headers
  if (sMaxAge && sMaxAge > 0) {
    headers['CDN-Cache-Control'] = `public, s-maxage=${sMaxAge}`;
    headers['Vercel-CDN-Cache-Control'] = `public, s-maxage=${sMaxAge}`;
    headers['Surrogate-Control'] = `public, max-age=${sMaxAge}`;
  }

  return headers;
}

// ============================================================================
// Presets for Common Use Cases
// ============================================================================

/**
 * Cache headers for static/rarely changing data
 */
export const STATIC_CACHE_HEADERS = getCacheHeaders({
  maxAge: 300, // 5 min browser
  sMaxAge: 3600, // 1 hour CDN
  staleWhileRevalidate: 86400, // 24 hour SWR
});

/**
 * Cache headers for dynamic product data
 */
export const PRODUCT_CACHE_HEADERS = getCacheHeaders({
  maxAge: 60, // 1 min browser
  sMaxAge: 300, // 5 min CDN
  staleWhileRevalidate: 600, // 10 min SWR
});

/**
 * Cache headers for user-specific data (private)
 */
export const USER_CACHE_HEADERS = getCacheHeaders({
  private: true,
  maxAge: 0,
  mustRevalidate: true,
});

/**
 * No cache headers
 */
export const NO_CACHE_HEADERS = getCacheHeaders({
  noStore: true,
});

// ============================================================================
// Exports
// ============================================================================

export default responseCache;

