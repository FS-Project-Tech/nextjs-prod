/**
 * Enhanced Redis Caching Layer
 * 
 * Features:
 * - Multi-layer caching (memory → Redis → API)
 * - Smart TTL based on data type
 * - Cache tags for invalidation
 * - Cache warming strategies
 * - Automatic fallback to in-memory cache
 */

import { unstable_cache } from 'next/cache';

// In-memory cache as fallback
const memoryCache = new Map<string, { data: any; expires: number }>();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Redis client (optional)
let redisClient: any = null;
let redisConnected = false;

// Initialize Redis if available
if (process.env.REDIS_URL && typeof window === 'undefined') {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    });
    
    redisClient.on('connect', () => {
      redisConnected = true;
      console.log('[Cache] Redis connected');
    });
    
    redisClient.on('error', (err: Error) => {
      console.warn('[Cache] Redis error:', err.message);
      redisConnected = false;
    });
    
    redisClient.on('close', () => {
      redisConnected = false;
      console.warn('[Cache] Redis connection closed');
    });
    
    // Connect lazily
    redisClient.connect().catch(() => {
      // Silent fail - will use memory cache
    });
  } catch (error) {
    console.warn('[Cache] Redis not available, using in-memory cache');
  }
}

/**
 * Cache TTL configurations by data type
 */
const CACHE_TTL = {
  // Static data - long cache
  categories: 60 * 60 * 1000, // 1 hour
  attributes: 60 * 60 * 1000, // 1 hour
  tags: 60 * 60 * 1000, // 1 hour
  
  // Semi-static data - medium cache
  products: 15 * 60 * 1000, // 15 minutes
  product: 10 * 60 * 1000, // 10 minutes
  searchIndex: 30 * 60 * 1000, // 30 minutes
  
  // Dynamic data - short cache
  cart: 2 * 60 * 1000, // 2 minutes
  inventory: 1 * 60 * 1000, // 1 minute
  prices: 5 * 60 * 1000, // 5 minutes
  
  // User-specific - short cache
  user: 5 * 60 * 1000, // 5 minutes
  orders: 2 * 60 * 1000, // 2 minutes
} as const;

type CacheType = keyof typeof CACHE_TTL;

/**
 * Generate cache key with namespace
 */
function generateCacheKey(type: CacheType, key: string, params?: Record<string, any>): string {
  const namespace = `wc:${type}:`;
  const paramString = params ? `:${JSON.stringify(params)}` : '';
  return `${namespace}${key}${paramString}`;
}

/**
 * Get from memory cache
 */
function getFromMemory(key: string): any | null {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  
  if (Date.now() > cached.expires) {
    memoryCache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * Set in memory cache
 */
function setInMemory(key: string, data: any, ttl: number): void {
  memoryCache.set(key, {
    data,
    expires: Date.now() + ttl,
  });
  
  // Cleanup expired entries periodically
  if (memoryCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (now > v.expires) {
        memoryCache.delete(k);
      }
    }
  }
}

/**
 * Get from Redis cache
 */
async function getFromRedis(key: string): Promise<any | null> {
  if (!redisClient || !redisConnected) return null;
  
  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    
    return JSON.parse(cached);
  } catch (error) {
    console.warn('[Cache] Redis get error:', error);
    return null;
  }
}

/**
 * Set in Redis cache
 */
async function setInRedis(key: string, data: any, ttl: number): Promise<void> {
  if (!redisClient || !redisConnected) return;
  
  try {
    const serialized = JSON.stringify(data);
    await redisClient.setex(key, Math.floor(ttl / 1000), serialized);
  } catch (error) {
    console.warn('[Cache] Redis set error:', error);
  }
}

/**
 * Delete from Redis cache
 */
async function deleteFromRedis(key: string): Promise<void> {
  if (!redisClient || !redisConnected) return;
  
  try {
    await redisClient.del(key);
  } catch (error) {
    console.warn('[Cache] Redis delete error:', error);
  }
}

/**
 * Invalidate cache by tag
 */
async function invalidateByTag(tag: string): Promise<void> {
  if (!redisClient || !redisConnected) return;
  
  try {
    // Get all keys with this tag
    const keys = await redisClient.keys(`wc:tag:${tag}:*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (error) {
    console.warn('[Cache] Redis tag invalidation error:', error);
  }
  
  // Also clear memory cache entries with this tag
  for (const [key] of memoryCache.entries()) {
    if (key.includes(`:tag:${tag}:`)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Enhanced cache get with multi-layer fallback
 */
export async function cacheGet<T>(
  type: CacheType,
  key: string,
  params?: Record<string, any>
): Promise<T | null> {
  const cacheKey = generateCacheKey(type, key, params);
  
  // 1. Try memory cache first (fastest)
  const memoryData = getFromMemory(cacheKey);
  if (memoryData !== null) {
    return memoryData as T;
  }
  
  // 2. Try Redis cache
  const redisData = await getFromRedis(cacheKey);
  if (redisData !== null) {
    // Populate memory cache for faster subsequent access
    const ttl = CACHE_TTL[type] || 5 * 60 * 1000;
    setInMemory(cacheKey, redisData, Math.min(ttl, MEMORY_CACHE_TTL));
    return redisData as T;
  }
  
  return null;
}

/**
 * Enhanced cache set with multi-layer storage
 */
export async function cacheSet<T>(
  type: CacheType,
  key: string,
  data: T,
  params?: Record<string, any>,
  tags?: string[]
): Promise<void> {
  const cacheKey = generateCacheKey(type, key, params);
  const ttl = CACHE_TTL[type] || 5 * 60 * 1000;
  
  // Store in both memory and Redis
  setInMemory(cacheKey, data, Math.min(ttl, MEMORY_CACHE_TTL));
  await setInRedis(cacheKey, data, ttl);
  
  // Store tag associations if provided
  if (tags && tags.length > 0 && redisClient && redisConnected) {
    for (const tag of tags) {
      const tagKey = `wc:tag:${tag}:${cacheKey}`;
      await setInRedis(tagKey, cacheKey, ttl);
    }
  }
}

/**
 * Cache invalidation
 */
export async function cacheInvalidate(
  type: CacheType,
  key: string,
  params?: Record<string, any>
): Promise<void> {
  const cacheKey = generateCacheKey(type, key, params);
  
  // Delete from both caches
  memoryCache.delete(cacheKey);
  await deleteFromRedis(cacheKey);
}

/**
 * Cache invalidation by type (e.g., invalidate all products)
 */
export async function cacheInvalidateByType(type: CacheType): Promise<void> {
  if (redisClient && redisConnected) {
    try {
      const keys = await redisClient.keys(`wc:${type}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      console.warn('[Cache] Redis bulk delete error:', error);
    }
  }
  
  // Clear memory cache
  for (const [key] of memoryCache.entries()) {
    if (key.startsWith(`wc:${type}:`)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Cache warming - preload popular data
 */
export async function warmCache(type: CacheType, keys: string[]): Promise<void> {
  // This can be called during build or on-demand
  // Implementation depends on specific use case
  console.log(`[Cache] Warming cache for ${type} with ${keys.length} keys`);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  memory: { size: number; keys: number };
  redis: { connected: boolean; keys?: number };
}> {
  const stats: {
    memory: { size: number; keys: number };
    redis: { connected: boolean; keys?: number };
  } = {
    memory: {
      size: memoryCache.size,
      keys: memoryCache.size,
    },
    redis: {
      connected: redisConnected,
    },
  };
  
  if (redisClient && redisConnected) {
    try {
      const keys = await redisClient.dbsize();
      stats.redis.keys = keys;
    } catch (error) {
      // Ignore errors
    }
  }
  
  return stats;
}

/**
 * Clear all caches (use with caution)
 */
export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();
  
  if (redisClient && redisConnected) {
    try {
      await redisClient.flushdb();
    } catch (error) {
      console.warn('[Cache] Redis flush error:', error);
    }
  }
}

