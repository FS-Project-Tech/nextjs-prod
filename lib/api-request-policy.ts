/**
 * Central /api rules for middleware (Edge-safe).
 * Order: bot firewall → per-route limits → global limit → public API key/origin → (caller) CSRF mutation guard.
 */

import { NextRequest, NextResponse } from "next/server";
import { isTrustedApiOrigin } from "@/lib/api-public-guards";
import { checkRateLimitSafe, fingerprintRequest, getClientIp } from "@/lib/rate-limit";
import { logBlockedBot, logRateLimit } from "@/lib/api-logging";
import type { RateLimitBackendResult } from "@/lib/api-rate-limit";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const BOT_UA_PATTERN = /amazonbot|semrush|ahrefs|mj12bot/i;

const API_SKIP_CROSS_SITE_GUARD_PREFIXES: string[] = [
  "/api/auth/",
  "/api/webhook",
  "/api/payment/eway/webhook",
  "/api/revalidate",
  "/api/typesense/search/sync",
  "/api/typesense/search/delete",
];

const globalPerMinute = Math.max(
  20,
  parseInt(process.env.API_GLOBAL_RATE_PER_MINUTE || "100", 10) || 100
);

function nextRateLimitResponse(r: Extract<RateLimitBackendResult, { ok: false }>): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests",
      code: "RATE_LIMITED",
      message: `Rate limit exceeded. Retry after ${r.resetSeconds} seconds.`,
      retryAfter: r.resetSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(r.resetSeconds),
        "X-RateLimit-Limit": String(r.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

export function rejectBlockedBot(req: NextRequest): NextResponse | null {
  const ua = req.headers.get("user-agent") || "";
  if (!BOT_UA_PATTERN.test(ua)) return null;

  const ip = getClientIp(req);
  logBlockedBot(ua, ip);
  return NextResponse.json(
    { error: "Forbidden", code: "BLOCKED_CLIENT", message: "Automated clients are not allowed." },
    { status: 403 }
  );
}

function isTypesenseSearchReadPath(path: string): boolean {
  if (!path.startsWith("/api/typesense/search")) return false;
  if (path.startsWith("/api/typesense/search/sync")) return false;
  if (path.startsWith("/api/typesense/search/delete")) return false;
  return true;
}

function isContactPath(path: string): boolean {
  return path === "/api/contact" || path.startsWith("/api/contact/");
}

/**
 * Stricter per-route limits (per IP, 60s window).
 */
export async function applyPerRouteApiRateLimits(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  const ip = getClientIp(req);
  const fp = fingerprintRequest(req);

  if (path.startsWith("/api/auth/")) {
    const r = await checkRateLimitSafe(ip, "auth", 10, 60);
    if (r.ok === false) {
      logRateLimit(ip, "auth", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (isContactPath(path)) {
    const r = await checkRateLimitSafe(ip, "contact", 5, 60);
    if (r.ok === false) {
      logRateLimit(ip, "contact", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (isTypesenseSearchReadPath(path)) {
    const r = await checkRateLimitSafe(ip, "typesense-search", 60, 60);
    if (r.ok === false) {
      logRateLimit(ip, "typesense-search", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (path.startsWith("/api/cart")) {
    const r = await checkRateLimitSafe(ip, "cart", 120, 60);
    if (r.ok === false) {
      logRateLimit(ip, "cart", fp);
      return nextRateLimitResponse(r);
    }
  }

  return null;
}

export async function applyGlobalApiRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const fp = fingerprintRequest(req);
  const r = await checkRateLimitSafe(ip, "global", globalPerMinute, 60);
  if (r.ok === false) {
    logRateLimit(ip, "global", fp);
    return nextRateLimitResponse(r);
  }
  return null;
}

export function shouldSkipCrossSiteGuard(pathname: string): boolean {
  return API_SKIP_CROSS_SITE_GUARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function rejectUntrustedApiMutation(req: NextRequest): NextResponse | null {
  if (req.method === "OPTIONS") return null;
  if (!MUTATION_METHODS.has(req.method)) return null;

  const path = req.nextUrl.pathname;
  if (shouldSkipCrossSiteGuard(path)) return null;

  const secFetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      {
        error: "Forbidden",
        code: "CROSS_SITE_FORBIDDEN",
        message: "Cross-site requests are not allowed.",
      },
      { status: 403 }
    );
  }

  const origin = req.headers.get("origin");
  if (origin && !isTrustedApiOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden", code: "ORIGIN_FORBIDDEN", message: "Request origin is not allowed." },
      { status: 403 }
    );
  }

  return null;
}

export { rejectUnlessTrustedOriginOrApiKey } from "@/lib/api-public-guards";
