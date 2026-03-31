/**
 * WooCommerce API Optimization Utility
 * 
 * Features:
 * - Batched API requests
 * - Revalidation support (revalidate key)
 * - Multi-layer caching (in-memory + Redis optional)
 * - Prefetch support for ISR
 * - Fallback loading states
 */

import { unstable_cache } from 'next/cache';
import wcAPI, { WooCommerceProduct, WooCommerceCategory } from './woocommerce';
import { getCachedResponse, generateCacheKey } from './api-cache';

// Redis client (optional - only if REDIS_URL is provided)
let redisClient: any = null;

if (process.env.REDIS_URL && typeof window === 'undefined') {
  try {
    // Dynamically import Redis client only if REDIS_URL is set
    // Install: npm install ioredis
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    
    redisClient.on('error', (err: Error) => {
      console.warn('Redis connection error:', err.message);
      redisClient = null; // Fallback to in-memory cache
    });
  } catch (error) {
    console.warn('Redis not available, using in-memory cache:', error);
  }
}

/**
 * Request batching queue
 */
interface BatchedRequest<T> {
  key: string;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

class RequestBatcher {
  private batchQueue: Map<string, BatchedRequest<any>[]> = new Map();
  private batchTimeout: number = 50; // 50ms batching window
  private maxBatchSize: number = 10; // Max requests per batch

  /**
   * Batch multiple requests together
   */
  async batch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    groupKey?: string
  ): Promise<T> {
    const batchKey = groupKey || key;
    
    return new Promise<T>((resolve, reject) => {
      if (!this.batchQueue.has(batchKey)) {
        this.batchQueue.set(batchKey, []);
        
        // Process batch after timeout
        setTimeout(() => {
          this.processBatch<T>(batchKey);
        }, this.batchTimeout);
      }
      
      const queue = this.batchQueue.get(batchKey)!;
      queue.push({
        key,
        promise: fetchFn(),
        resolve,
        reject,
      });
      
      // Process immediately if batch is full
      if (queue.length >= this.maxBatchSize) {
        this.processBatch<T>(batchKey);
      }
    });
  }

  private async processBatch<T>(batchKey: string): Promise<void> {
    const queue = this.batchQueue.get(batchKey);
    if (!queue || queue.length === 0) {
      this.batchQueue.delete(batchKey);
      return;
    }

    // Remove from queue
    this.batchQueue.delete(batchKey);

    // Execute all requests in parallel
    const promises = queue.map((req) => req.promise);
    
    try {
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        const req = queue[index];
        if (result.status === 'fulfilled') {
          req.resolve(result.value);
        } else {
          req.reject(result.reason);
        }
      });
    } catch (error) {
      // If batch fails, reject all requests
      queue.forEach((req) => {
        req.reject(error as Error);
      });
    }
  }
}

const batcher = new RequestBatcher();

/**
 * Cache configuration
 */
interface CacheConfig {
  revalidate?: number; // Revalidation time in seconds
  tags?: string[]; // Cache tags for revalidation
  ttl?: number; // Time to live in milliseconds (for in-memory cache)
  useRedis?: boolean; // Force Redis usage (if available)
}

/**
 * Fetch data from Redis cache
 */
async function getRedisCache<T>(key: string): Promise<T | null> {
  if (!redisClient) return null;
  
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    console.warn('Redis get error:', error);
  }
  
  return null;
}

/**
 * Set data in Redis cache
 */
async function setRedisCache<T>(key: string, data: T, ttl: number): Promise<void> {
  if (!redisClient) return;
  
  try {
    const serialized = JSON.stringify(data);
    await redisClient.setex(key, Math.floor(ttl / 1000), serialized);
  } catch (error) {
    console.warn('Redis set error:', error);
  }
}

/**
 * Main fetchWooData function
 */
export async function fetchWooData<T>(
  endpoint: string,
  params?: Record<string, any>,
  options?: {
    cache?: CacheConfig;
    batch?: boolean;
    batchGroup?: string;
    fallback?: T; // Fallback data if fetch fails
  }
): Promise<T> {
  const {
    cache = { revalidate: 300, tags: [], ttl: 5 * 60 * 1000 },
    batch = false,
    batchGroup,
    fallback,
  } = options || {};

  const cacheKey = generateCacheKey(endpoint, params);
  const revalidateKey = cache.revalidate || 300;
  const cacheTags = cache.tags || [];

  // Fetch function
  const fetchFn = async (): Promise<T> => {
    try {
      const response = await wcAPI.get(endpoint, { params });
      return response.data as T;
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      
      // Return fallback if provided
      if (fallback !== undefined) {
        return fallback;
      }
      
      throw error;
    }
  };

  // Use batching if enabled
  if (batch) {
    return batcher.batch(cacheKey, fetchFn, batchGroup);
  }

  // Check Redis cache first (if available)
  if (cache.useRedis && redisClient) {
    const redisCached = await getRedisCache<T>(cacheKey);
    if (redisCached !== null) {
      return redisCached;
    }
  }

  // Use Next.js unstable_cache for server-side caching with revalidation
  if (typeof window === 'undefined' && cache.revalidate) {
    const cachedFn = unstable_cache(
      async () => {
        const data = await fetchFn();
        
        // Also cache in Redis if available
        if (redisClient && cache.ttl) {
          await setRedisCache(cacheKey, data, cache.ttl);
        }
        
        return data;
      },
      [cacheKey],
      {
        revalidate: revalidateKey,
        tags: cacheTags,
      }
    );

    return cachedFn();
  }

  // Fallback to in-memory cache (server-side) or direct fetch (client-side)
  if (typeof window === 'undefined') {
    return getCachedResponse(
      cacheKey,
      async () => {
        const data = await fetchFn();
        
        // Also cache in Redis if available
        if (redisClient && cache.ttl) {
          await setRedisCache(cacheKey, data, cache.ttl);
        }
        
        return data;
      },
      cache.ttl
    );
  }

  // Client-side: direct fetch
  return fetchFn();
}

/**
 * Batch fetch multiple products by IDs
 */
export async function fetchProductsBatch(
  productIds: number[],
  options?: { cache?: CacheConfig; fallback?: WooCommerceProduct[] }
): Promise<WooCommerceProduct[]> {
  if (productIds.length === 0) {
    return options?.fallback || [];
  }

  // WooCommerce supports include parameter for batch fetching
  return fetchWooData<WooCommerceProduct[]>(
    '/products',
    { include: productIds.join(',') },
    {
      cache: {
        revalidate: 300,
        tags: ['products'],
        ttl: 5 * 60 * 1000,
        ...options?.cache,
      },
      batch: true,
      batchGroup: 'products-batch',
      fallback: options?.fallback || [],
    }
  );
}

/**
 * Batch fetch multiple categories by IDs
 */
export async function fetchCategoriesBatch(
  categoryIds: number[],
  options?: { cache?: CacheConfig; fallback?: WooCommerceCategory[] }
): Promise<WooCommerceCategory[]> {
  if (categoryIds.length === 0) {
    return options?.fallback || [];
  }

  return fetchWooData<WooCommerceCategory[]>(
    '/products/categories',
    { include: categoryIds.join(',') },
    {
      cache: {
        revalidate: 600,
        tags: ['categories'],
        ttl: 10 * 60 * 1000,
        ...options?.cache,
      },
      batch: true,
      batchGroup: 'categories-batch',
      fallback: options?.fallback || [],
    }
  );
}

/**
 * Prefetch products for ISR (build time)
 */
export async function prefetchProducts(
  params?: {
    per_page?: number;
    page?: number;
    orderby?: string;
    order?: string;
    category?: string | number;
    featured?: boolean;
  },
  options?: { maxPages?: number }
): Promise<WooCommerceProduct[]> {
  const maxPages = options?.maxPages || 10;
  const perPage = params?.per_page || 100;
  const allProducts: WooCommerceProduct[] = [];

  try {
    // Fetch first page to get total count
    const firstPage = await fetchWooData<WooCommerceProduct[]>(
      '/products',
      { ...params, per_page: perPage, page: 1 },
      {
        cache: {
          revalidate: 300,
          tags: ['products', 'prefetch'],
          ttl: 5 * 60 * 1000,
        },
      }
    );

    allProducts.push(...firstPage);

    // Calculate total pages
    // Note: WooCommerce API returns x-wp-totalpages header
    // For simplicity, we'll fetch up to maxPages
    const pagesToFetch = Math.min(maxPages, 10);

    // Fetch remaining pages in parallel
    if (pagesToFetch > 1) {
      const pagePromises = Array.from({ length: pagesToFetch - 1 }, (_, i) =>
        fetchWooData<WooCommerceProduct[]>(
          '/products',
          { ...params, per_page: perPage, page: i + 2 },
          {
            cache: {
              revalidate: 300,
              tags: ['products', 'prefetch'],
              ttl: 5 * 60 * 1000,
            },
          }
        )
      );

      const results = await Promise.allSettled(pagePromises);
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          allProducts.push(...result.value);
        }
      });
    }
  } catch (error) {
    console.error('Error prefetching products:', error);
  }

  return allProducts;
}

/**
 * Prefetch categories for ISR (build time)
 */
export async function prefetchCategories(
  options?: { hide_empty?: boolean; parent?: number }
): Promise<WooCommerceCategory[]> {
  try {
    return await fetchWooData<WooCommerceCategory[]>(
      '/products/categories',
      {
        per_page: 100,
        hide_empty: options?.hide_empty ?? true,
        ...(options?.parent !== undefined && { parent: options.parent }),
      },
      {
        cache: {
          revalidate: 600,
          tags: ['categories', 'prefetch'],
          ttl: 10 * 60 * 1000,
        },
      }
    );
  } catch (error) {
    console.error('Error prefetching categories:', error);
    return [];
  }
}

/**
 * Revalidate cache by tags
 */
export async function revalidateCache(tags: string[]): Promise<void> {
  // Next.js revalidation is handled automatically via cache tags
  // This function is for manual revalidation if needed
  
  if (typeof window === 'undefined') {
    // Server-side: clear in-memory cache entries with matching tags
    // Note: This is a simplified implementation
    // In production, you'd want to track which cache keys belong to which tags
    
    if (redisClient) {
      try {
        // If using Redis, you can implement tag-based invalidation
        // This requires maintaining a tag-to-keys mapping
      } catch (error) {
        console.warn('Redis revalidation error:', error);
      }
    }
  }
}

/**
 * Export Redis client for advanced usage (if available)
 */
export function getRedisClient() {
  return redisClient;
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (!redisClient) return false;
  
  try {
    await redisClient.ping();
    return true;
  } catch {
    return false;
  }
}

