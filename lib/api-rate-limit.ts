/**
 * Edge-safe rate limiting — in-memory with optional Redis (ioredis / Upstash / Vercel KV–style).
 *
 * - Default path: `checkRateLimitSafe` tries `customBackend` (if set), then `distributed-rate-limit`
 *   when Redis is configured, then falls back to in-memory `rateLimitConsume`.
 * - Upstash REST: implement `DistributedRateLimitBackend` and call `setRateLimitBackend(fn)` once
 *   at server startup (Node only — do not import that wiring from middleware).
 *
 * Sync helper (same as `rateLimitConsume`): `rateLimit(ip, routeKey, limit, windowSec)`.
 */

import type { NextRequest } from "next/server";

export type RateLimitBackendResult =
  | { ok: true; limit: number; remaining: number; resetSeconds: number }
  | { ok: false; limit: number; remaining: 0; resetSeconds: number };

export type DistributedRateLimitBackend = (args: {
  compositeKey: string;
  windowSeconds: number;
  maxRequests: number;
}) => Promise<RateLimitBackendResult | null>;

let customBackend: DistributedRateLimitBackend | null = null;

/** Plug Redis / Upstash / Vercel KV here (return null to use in-memory only). */
export function setRateLimitBackend(fn: DistributedRateLimitBackend | null): void {
  customBackend = fn;
}

type Bucket = {
  count: number;
  resetAt: number;
};

const memory = new Map<string, Bucket>();

/** Violation strikes per identity (IP) for temporary blocks. */
const abuseByIp = new Map<string, { strikes: number; windowEnd: number; blockedUntil?: number }>();

const ABUSE_STRIKE_WINDOW_MS = 10 * 60 * 1000;
const ABUSE_STRIKE_THRESHOLD = 12;
const ABUSE_BLOCK_MS = 15 * 60 * 1000;

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** FNV-1a 32-bit — Edge-safe, no crypto import. */
export function fingerprintRequest(req: NextRequest): string {
  const ip = getClientIp(req);
  const ua = (req.headers.get("user-agent") || "").slice(0, 160);
  let h = 2166136261;
  const str = `${ip}|${ua}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildStoreKey(ip: string, routeKey: string, limit: number, windowSec: number): string {
  return `${routeKey}:${limit}:${windowSec}:${ip}`;
}

export type ConsumeRateLimitResult =
  | { allowed: true; remaining: number; resetSec: number }
  | { allowed: false; remaining: 0; resetSec: number };

/**
 * Synchronous in-memory take (Edge-safe). Prefer `checkRateLimitSafe` for Redis.
 * @param ip Client IP (use getClientIp)
 * @param routeKey Logical bucket name, e.g. "global", "auth", "cart"
 */
export function rateLimitConsume(
  ip: string,
  routeKey: string,
  limit: number,
  windowSec: number
): ConsumeRateLimitResult {
  if (limit < 1 || windowSec < 1) {
    return { allowed: true, remaining: limit, resetSec: windowSec };
  }

  const blocked = isIpTemporarilyBlocked(ip);
  if (blocked) {
    return {
      allowed: false,
      remaining: 0,
      resetSec: Math.ceil((blocked - Date.now()) / 1000) || 1,
    };
  }

  const key = buildStoreKey(ip, routeKey, limit, windowSec);
  const now = Date.now();
  const windowMs = windowSec * 1000;
  let b = memory.get(key);

  if (!b || now >= b.resetAt) {
    b = { count: 1, resetAt: now + windowMs };
    memory.set(key, b);
    return { allowed: true, remaining: limit - 1, resetSec: Math.ceil(windowMs / 1000) };
  }

  if (b.count >= limit) {
    recordAbuseStrike(ip);
    const resetSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetSec };
  }

  b.count++;
  const resetSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return { allowed: true, remaining: Math.max(0, limit - b.count), resetSec };
}

function isIpTemporarilyBlocked(ip: string): number | null {
  const row = abuseByIp.get(ip);
  if (!row?.blockedUntil) return null;
  if (Date.now() < row.blockedUntil) return row.blockedUntil;
  row.blockedUntil = undefined;
  return null;
}

function recordAbuseStrike(ip: string): void {
  const now = Date.now();
  let row = abuseByIp.get(ip);
  if (!row || now > row.windowEnd) {
    row = { strikes: 1, windowEnd: now + ABUSE_STRIKE_WINDOW_MS };
    abuseByIp.set(ip, row);
    return;
  }
  row.strikes++;
  if (row.strikes >= ABUSE_STRIKE_THRESHOLD) {
    row.blockedUntil = now + ABUSE_BLOCK_MS;
    row.strikes = 0;
    row.windowEnd = now + ABUSE_STRIKE_WINDOW_MS;
  }
}

/**
 * Async rate check: tries custom/Redis backend first, then in-memory.
 * Signature: (ip, routeKey, limit, windowSec)
 */
export async function checkRateLimitSafe(
  ip: string,
  routeKey: string,
  limit: number,
  windowSec: number
): Promise<RateLimitBackendResult> {
  const blocked = isIpTemporarilyBlocked(ip);
  if (blocked) {
    const resetSeconds = Math.max(1, Math.ceil((blocked - Date.now()) / 1000));
    return { ok: false, limit, remaining: 0, resetSeconds };
  }

  const compositeKey = `v2:${routeKey}:${ip}`;
  const windowSeconds = Math.max(1, Math.floor(windowSec));

  if (customBackend) {
    try {
      const r = await customBackend({ compositeKey, windowSeconds, maxRequests: limit });
      if (r) {
        if (!r.ok) recordAbuseStrike(ip);
        return r;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const { checkRateLimitDistributed } = await import("./distributed-rate-limit");
    const distributed = await checkRateLimitDistributed(compositeKey, {
      windowSeconds,
      maxRequests: limit,
    });
    if (distributed) {
      if (!distributed.ok) recordAbuseStrike(ip);
      return distributed;
    }
  } catch {
    /* fall through */
  }

  const local = rateLimitConsume(ip, routeKey, limit, windowSec);
  if (!local.allowed) {
    return { ok: false, limit, remaining: 0, resetSeconds: local.resetSec };
  }
  return { ok: true, limit, remaining: local.remaining, resetSeconds: local.resetSec };
}

/**
 * Synchronous in-memory rate limit take (contract: rateLimit(ip, key, limit, windowSec)).
 * Prefer {@link checkRateLimitSafe} when Redis / distributed limits are required.
 */
export function rateLimit(
  ip: string,
  routeKey: string,
  limit: number,
  windowSec: number
): ConsumeRateLimitResult {
  return rateLimitConsume(ip, routeKey, limit, windowSec);
}

/** @deprecated Prefer checkRateLimitSafe(ip, routeKey, limit, windowSec) */
export async function checkRateLimitSafeLegacy(
  identifier: string,
  override: { windowMs?: number; maxRequests?: number } = {}
): Promise<RateLimitBackendResult> {
  const windowMs = override.windowMs ?? 15 * 60 * 1000;
  const maxRequests = override.maxRequests ?? 5;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  return checkRateLimitSafe(identifier, "legacy", maxRequests, windowSec);
}

export function rateLimit429Response(r: Extract<RateLimitBackendResult, { ok: false }>): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      code: "RATE_LIMITED",
      message: `Rate limit exceeded. Retry after ${r.resetSeconds} seconds.`,
      retryAfter: r.resetSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(r.resetSeconds),
        "X-RateLimit-Limit": String(r.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
