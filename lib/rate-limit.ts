/**
 * Simple in-memory rate limiting
 * For production, use Redis or a proper rate limiting service
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  windowMs: number;
  maxRequests: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5; // Max 5 requests per window

type RateLimitOverride = {
  windowMs?: number;
  maxRequests?: number;
};

function scopedStoreKey(identifier: string, windowMs: number, maxRequests: number): string {
  return `${windowMs}:${maxRequests}:${identifier}`;
}

function checkRateLimitInMemory(
  identifier: string,
  windowMs: number,
  maxRequests: number
): boolean {
  const now = Date.now();
  const key = scopedStoreKey(identifier, windowMs, maxRequests);
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
      windowMs,
      maxRequests,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP, email, etc.)
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(identifier: string): boolean {
  return checkRateLimitInMemory(identifier, RATE_LIMIT_WINDOW, MAX_REQUESTS);
}

/**
 * Async-compatible wrapper. Uses Redis when configured, otherwise in-memory.
 * This is additive and won't break existing callers of checkRateLimit().
 */
export async function checkRateLimitSafe(
  identifier: string,
  override: RateLimitOverride = {}
): Promise<
  | { ok: true; limit: number; remaining: number; resetSeconds: number }
  | { ok: false; limit: number; remaining: 0; resetSeconds: number }
> {
  const windowMs = override.windowMs ?? RATE_LIMIT_WINDOW;
  const maxRequests = override.maxRequests ?? MAX_REQUESTS;

  const distributedKey = scopedStoreKey(identifier, windowMs, maxRequests);

  try {
    const { checkRateLimitDistributed } = await import("./distributed-rate-limit");
    const distributed = await checkRateLimitDistributed(distributedKey, {
      windowSeconds: Math.ceil(windowMs / 1000),
      maxRequests,
    });
    if (distributed) return distributed;
  } catch {
    // ignore and fall back to in-memory
  }

  const ok = checkRateLimitInMemory(identifier, windowMs, maxRequests);
  const remaining = getRemainingRequestsScoped(identifier, windowMs, maxRequests);
  const resetSeconds = Math.ceil(windowMs / 1000);
  return ok
    ? { ok: true, limit: maxRequests, remaining, resetSeconds }
    : { ok: false, limit: maxRequests, remaining: 0, resetSeconds };
}

function getRemainingRequestsScoped(
  identifier: string,
  windowMs: number,
  maxRequests: number
): number {
  const key = scopedStoreKey(identifier, windowMs, maxRequests);
  const entry = rateLimitStore.get(key);
  if (!entry) return maxRequests;

  const now = Date.now();
  if (now > entry.resetTime) return maxRequests;

  return Math.max(0, maxRequests - entry.count);
}

/**
 * Get remaining requests for identifier
 */
export function getRemainingRequests(identifier: string): number {
  return getRemainingRequestsScoped(identifier, RATE_LIMIT_WINDOW, MAX_REQUESTS);
}

/**
 * Cleanup expired entries periodically
 */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Run every minute
}
