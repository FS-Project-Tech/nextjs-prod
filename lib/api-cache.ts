/**
 * API Response Caching
 * Provides caching layer for WooCommerce API calls to improve performance
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes default

  /**
   * Get cached data if still valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Generate cache key from request parameters
   */
  generateKey(endpoint: string, params?: Record<string, any>): string {
    const sortedParams = params 
      ? Object.keys(params)
          .sort()
          .map(key => `${key}=${JSON.stringify(params[key])}`)
          .join('&')
      : '';
    return `${endpoint}${sortedParams ? `?${sortedParams}` : ''}`;
  }
}

// Server-side cache instance (only in Node.js environment)
let serverCache: APICache | null = null;

if (typeof window === 'undefined') {
  serverCache = new APICache();
}

/**
 * Get cached API response or fetch and cache
 */
export async function getCachedResponse<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Only cache on server-side
  if (typeof window !== 'undefined') {
    return fetchFn();
  }

  if (!serverCache) {
    return fetchFn();
  }

  // Check cache first
  const cached = serverCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  const data = await fetchFn();
  serverCache.set(key, data, ttl);
  return data;
}

/**
 * Clear cache for specific key
 */
export function clearCache(key: string): void {
  if (serverCache) {
    serverCache.delete(key);
  }
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  if (serverCache) {
    serverCache.clear();
  }
}

/**
 * Generate cache key for WooCommerce API call
 */
export function generateCacheKey(endpoint: string, params?: Record<string, any>): string {
  if (serverCache) {
    return serverCache.generateKey(endpoint, params);
  }
  return `${endpoint}${params ? JSON.stringify(params) : ''}`;
}

