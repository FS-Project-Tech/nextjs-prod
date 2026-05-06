/**
 * Edge-safe API guards: CORS allowlist, rate limiting, Sec-Fetch checks, public API key.
 * No Node "server-only" or next/headers — safe for Next.js middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitSafe, rateLimitConsume } from "@/lib/api-rate-limit";
import { getRateLimitIdentity } from "@/lib/rate-limit-identity";
import { jsonApiError } from "@/lib/api-errors";

const ALLOWED_ORIGINS = [
  "https://joyamedicalsupplies.com.au",
  "https://www.joyamedicalsupplies.com.au",
];
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

function collectConfiguredOrigins(): string[] {
  const out = new Set<string>();
  const raw = process.env.ALLOWED_API_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const s = part.trim();
      if (s) out.add(s);
    }
  }
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_FRONTEND_URL",
    "NEXT_PUBLIC_WP_URL",
  ] as const) {
    const u = process.env[key]?.trim();
    if (!u) continue;
    try {
      out.add(new URL(u).origin);
    } catch {
      /* ignore */
    }
  }
  if (process.env.VERCEL_URL?.trim()) {
    out.add(`https://${process.env.VERCEL_URL.trim()}`);
  }
  return Array.from(out);
}

export const API_RATE_LIMITS = {
  CHECKOUT_WRITE: { windowMs: 60_000, maxRequests: 30, softFail: true },
  ORDER_WRITE: { windowMs: 60 * 1000, maxRequests: 20 },
  EWAY_PAYMENT_INIT: { windowMs: 60 * 1000, maxRequests: 10 },
  CART_MERGE: { windowMs: 60 * 1000, maxRequests: 20, softFail: true },
  PRODUCTS_READ: { windowMs: 60 * 1000, maxRequests: 120 },
  TYPESENSE_SEARCH_READ: { windowMs: 60 * 1000, maxRequests: 180 },
  WEBHOOK_POST: { windowMs: 60 * 1000, maxRequests: 60 },
} as const;

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return collectConfiguredOrigins().includes(origin);
}

export function isTrustedApiOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  if (origin === req.nextUrl.origin) return true;
  return validateOrigin(req);
}

/** False when Origin header is missing; otherwise same checks as allowlist / deployment. */
export function isPresentOriginTrusted(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === req.nextUrl.origin) return true;
  return ALLOWED_ORIGINS.includes(origin) || collectConfiguredOrigins().includes(origin);
}

export function validateTrustedBrowserOrigin(
  req: NextRequest,
  options: { allowNoOrigin?: boolean } = {}
): boolean {
  const origin = req.headers.get("origin");
  const secFetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();

  if (secFetchSite && !ALLOWED_FETCH_SITES.has(secFetchSite)) {
    return false;
  }

  if (!origin) {
    return options.allowNoOrigin === true;
  }

  if (origin === req.nextUrl.origin) {
    return true;
  }

  return validateOrigin(req);
}

export function corsResponse(req: NextRequest, response: NextResponse): NextResponse {
  const origin = req.headers.get("origin");

  if (origin && validateOrigin(req)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  return response;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export function getConfiguredPublicApiKey(): string {
  return process.env.NEXT_PUBLIC_API_KEY?.trim() || "";
}

export function hasValidPublicApiKey(req: NextRequest): boolean {
  const envKey = getConfiguredPublicApiKey();
  if (!envKey) return false;
  const presented = req.headers.get("x-api-key")?.trim() || "";
  return timingSafeEqualString(presented, envKey);
}

/** Cart, products, Typesense search (not sync/delete). */
export function isPublicApiKeyProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/api/cart")) return true;
  if (pathname.startsWith("/api/products")) return true;
  if (pathname.startsWith("/api/typesense/search")) {
    if (pathname.startsWith("/api/typesense/search/sync")) return false;
    if (pathname.startsWith("/api/typesense/search/delete")) return false;
    return true;
  }
  return false;
}

/**
 * When NEXT_PUBLIC_API_KEY is set: require trusted Origin OR valid x-api-key.
 * Blocks wrong Origin without key, and no-Origin without key (curl / scrapers).
 */
export function rejectUnlessTrustedOriginOrApiKey(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;
  if (!isPublicApiKeyProtectedPath(pathname)) return null;

  const envKey = getConfiguredPublicApiKey();
  if (!envKey) return null;

  if (hasValidPublicApiKey(req)) return null;

  const origin = req.headers.get("origin");
  if (origin && isPresentOriginTrusted(req)) return null;

  return jsonApiError(
    403,
    "ORIGIN_OR_KEY_REQUIRED",
    origin
      ? "Request origin is not allowed for this resource."
      : "Provide a valid x-api-key header or call from an allowed browser origin."
  );
}

interface RouteRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  identifier?: (req: NextRequest) => string | Promise<string>;
  /** Distinct bucket; defaults from window/max */
  routeKey?: string;
  /** When true, log and allow the request (no 429). */
  softFail?: boolean;
}

/**
 * Same contract as {@link rateLimit}, but uses in-process counters only — no Redis / Upstash / TCP backends.
 * Use for checkout-related routes so rate limits stay off distributed stores.
 */
export function rateLimitMemory(config: Partial<RouteRateLimitConfig> = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const maxRequests = config.maxRequests ?? 60;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const routeKey = config.routeKey ?? `route:w${windowMs}:m${maxRequests}`;
  const softFail = config.softFail === true;

  return async (req: NextRequest): Promise<NextResponse | null> => {
    const id = config.identifier
      ? await Promise.resolve(config.identifier(req))
      : await getRateLimitIdentity(req);
    const local = rateLimitConsume(id, routeKey, maxRequests, windowSec);
    if (local.allowed) return null;

    if (softFail) {
      console.warn("[rate-limit] soft-fail (memory)", { routeKey, path: req.nextUrl.pathname });
      return null;
    }

    return NextResponse.json(
      {
        error: "Too many requests",
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Please try again in ${local.resetSec} seconds.`,
        retryAfter: local.resetSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(local.resetSec),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  };
}

/**
 * Route handler rate limiter — scoped per routeKey + limit tuple (not shared across unrelated routes).
 * Uses {@link checkRateLimitSafe} (Redis when configured). Identity defaults to user id or IP.
 */
export function rateLimit(config: Partial<RouteRateLimitConfig> = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const maxRequests = config.maxRequests ?? 60;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const routeKey = config.routeKey ?? `route:w${windowMs}:m${maxRequests}`;
  const softFail = config.softFail === true;

  return async (req: NextRequest): Promise<NextResponse | null> => {
    const id = config.identifier
      ? await Promise.resolve(config.identifier(req))
      : await getRateLimitIdentity(req);
    const r = await checkRateLimitSafe(id, routeKey, maxRequests, windowSec);
    if (r.ok !== false) return null;

    if (softFail) {
      console.warn("[rate-limit] soft-fail", { routeKey, path: req.nextUrl.pathname });
      return null;
    }

    return NextResponse.json(
      {
        error: "Too many requests",
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Please try again in ${r.resetSeconds} seconds.`,
        retryAfter: r.resetSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(r.resetSeconds),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  };
}
