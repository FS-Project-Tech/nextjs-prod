/**
 * Checkout session persistence.
 *
 * Default: in-memory Map (OK for single Node process / local dev).
 * On serverless multi-instance deployments, use Redis or another shared store
 * (implement CheckoutSessionStore and wire via env).
 */

import type { CheckoutSessionRecord } from "@/types/checkout-session";

export interface CheckoutSessionStore {
  put(record: CheckoutSessionRecord): void;
  get(token: string): CheckoutSessionRecord | undefined;
  /**
   * Mark session as used exactly once. Returns true if this call consumed it.
   */
  consume(token: string): boolean;
  getTokenByIdempotencyKey(key: string): string | undefined;
  putIdempotency(key: string, token: string, expiresAt: number): void;
}

class InMemoryCheckoutSessionStore implements CheckoutSessionStore {
  private byToken = new Map<string, CheckoutSessionRecord>();
  private idempotency = new Map<string, { token: string; expiresAt: number }>();

  private prune(): void {
    const now = Date.now();
    for (const [k, r] of this.byToken) {
      if (r.expiresAt < now) {
        this.byToken.delete(k);
      }
    }
    for (const [k, v] of this.idempotency) {
      if (v.expiresAt < now) {
        this.idempotency.delete(k);
      }
    }
  }

  put(record: CheckoutSessionRecord): void {
    this.prune();
    this.byToken.set(record.token, record);
  }

  get(token: string): CheckoutSessionRecord | undefined {
    this.prune();
    return this.byToken.get(token);
  }

  consume(token: string): boolean {
    const r = this.byToken.get(token);
    if (!r || r.used || r.expiresAt < Date.now()) {
      return false;
    }
    r.used = true;
    r.usedAt = Date.now();
    return true;
  }

  getTokenByIdempotencyKey(key: string): string | undefined {
    this.prune();
    const e = this.idempotency.get(key);
    if (!e || e.expiresAt < Date.now()) {
      this.idempotency.delete(key);
      return undefined;
    }
    return e.token;
  }

  putIdempotency(key: string, token: string, expiresAt: number): void {
    this.idempotency.set(key, { token, expiresAt });
  }
}

const globalKey = "__checkoutSessionStore";

function getGlobalStore(): InMemoryCheckoutSessionStore {
  const g = globalThis as unknown as Record<string, InMemoryCheckoutSessionStore>;
  if (!g[globalKey]) {
    g[globalKey] = new InMemoryCheckoutSessionStore();
  }
  return g[globalKey];
}

export function getCheckoutSessionStore(): CheckoutSessionStore {
  // Future: if (process.env.CHECKOUT_SESSION_REDIS_URL) return new RedisCheckoutSessionStore(...)
  return getGlobalStore();
}
