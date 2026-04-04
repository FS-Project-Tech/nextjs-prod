/**
 * Checkout Security Utilities
 * CSRF protection, idempotency, and order locking
 */

import { randomBytes } from "crypto";

// In-memory store for idempotency keys and order locks
// In production, use Redis or a database
const idempotencyStore = new Map<string, { result: any; expiresAt: number }>();
const orderLocks = new Map<string, { lockedAt: number; expiresAt: number }>();

const IDEMPOTENCY_TTL = 5 * 60 * 1000; // 5 minutes
const ORDER_LOCK_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  return token === sessionToken;
}

/**
 * Generate idempotency key from request
 */
export function generateIdempotencyKey(
  cartItems: Array<{ productId: number; quantity: number }>,
  total: number
): string {
  const itemsHash = cartItems
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort()
    .join(",");
  const key = `guest-${itemsHash}-${total}`;
  return Buffer.from(key).toString("base64");
}

/**
 * Check if request is idempotent (already processed)
 */
export function checkIdempotency(key: string): { isDuplicate: boolean; result?: any } {
  const stored = idempotencyStore.get(key);

  if (!stored) {
    return { isDuplicate: false };
  }

  // Check if expired
  if (Date.now() > stored.expiresAt) {
    idempotencyStore.delete(key);
    return { isDuplicate: false };
  }

  return { isDuplicate: true, result: stored.result };
}

/**
 * Read stored order result for a key (used to recover when POST response body is stripped).
 * Does not delete the entry. Returns null if missing or expired.
 */
export function getStoredIdempotencyResult(key: string): any | null {
  if (!key || typeof key !== "string" || key.length > 512) {
    return null;
  }
  const stored = idempotencyStore.get(key);
  if (!stored) {
    return null;
  }
  if (Date.now() > stored.expiresAt) {
    idempotencyStore.delete(key);
    return null;
  }
  return stored.result;
}

/**
 * Store idempotency result
 */
export function storeIdempotencyResult(key: string, result: any): void {
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL,
  });

  // Cleanup expired entries periodically
  if (idempotencyStore.size > 1000) {
    const now = Date.now();
    for (const [k, v] of idempotencyStore.entries()) {
      if (now > v.expiresAt) {
        idempotencyStore.delete(k);
      }
    }
  }
}

/**
 * Acquire order lock (prevents duplicate orders)
 */
export function acquireOrderLock(orderKey: string): { success: boolean; lockId?: string } {
  const existing = orderLocks.get(orderKey);

  if (existing && Date.now() < existing.expiresAt) {
    return { success: false };
  }

  const lockId = randomBytes(16).toString("hex");
  orderLocks.set(orderKey, {
    lockedAt: Date.now(),
    expiresAt: Date.now() + ORDER_LOCK_TTL,
  });

  return { success: true, lockId };
}

/**
 * Release order lock
 */
export function releaseOrderLock(orderKey: string): void {
  orderLocks.delete(orderKey);
}

/**
 * Cleanup expired locks
 */
export function cleanupExpiredLocks(): void {
  const now = Date.now();
  for (const [key, lock] of orderLocks.entries()) {
    if (now > lock.expiresAt) {
      orderLocks.delete(key);
    }
  }
}

// Periodic cleanup
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredLocks, 60000); // Every minute
}
