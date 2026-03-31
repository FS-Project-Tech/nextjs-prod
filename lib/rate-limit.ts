/**
 * Simple in-memory rate limiting
 * For production, use Redis or a proper rate limiting service
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5; // Max 5 requests per window

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP, email, etc.)
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false; // Rate limited
  }

  // Increment count
  entry.count++;
  return true;
}

/**
 * Get remaining requests for identifier
 */
export function getRemainingRequests(identifier: string): number {
  const entry = rateLimitStore.get(identifier);
  if (!entry) return MAX_REQUESTS;
  
  const now = Date.now();
  if (now > entry.resetTime) return MAX_REQUESTS;
  
  return Math.max(0, MAX_REQUESTS - entry.count);
}

/**
 * Cleanup expired entries periodically
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Run every minute
}

