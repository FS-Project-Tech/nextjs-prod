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

function parseLimit(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

const WINDOW_SEC = 60;
const globalPerMinute = Math.max(20, parseLimit("API_GLOBAL_RATE_PER_MINUTE", 100));
const standardPerMinute = Math.max(30, parseLimit("API_STANDARD_RATE_PER_MINUTE", 120));
const API_RATE = {
  typesenseWrite: parseLimit("API_RATE_TYPESENSE_WRITE", 20),
  auth: parseLimit("API_RATE_AUTH", 10),
  contact: parseLimit("API_RATE_CONTACT", 5),
  revalidate: parseLimit("API_RATE_REVALIDATE", 15),
  checkout: parseLimit("API_RATE_CHECKOUT", 45),
  payment: parseLimit("API_RATE_PAYMENT", 40),
  webhook: parseLimit("API_RATE_WEBHOOK", 60),
  orders: parseLimit("API_RATE_ORDERS", 50),
  leadForms: parseLimit("API_RATE_LEAD_FORMS", 12),
  dashboard: parseLimit("API_RATE_DASHBOARD", 80),
  wc: parseLimit("API_RATE_WC", 100),
  cms: parseLimit("API_RATE_CMS", 90),
  shipping: parseLimit("API_RATE_SHIPPING", 50),
  catalog: parseLimit("API_RATE_CATALOG", 120),
  cart: parseLimit("API_RATE_CART", 120),
  typesenseSearch: parseLimit("API_RATE_TYPESENSE_SEARCH", 60),
  analytics: parseLimit("API_RATE_ANALYTICS", 40),
  performance: parseLimit("API_RATE_PERFORMANCE", 30),
} as const;

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

function isTypesenseWritePath(path: string): boolean {
  return (
    path.startsWith("/api/typesense/search/sync") || path.startsWith("/api/typesense/search/delete")
  );
}

function isCheckoutPath(path: string): boolean {
  return (
    path.startsWith("/api/checkout") ||
    path.startsWith("/api/create-order") ||
    path.startsWith("/api/verify-payment") ||
    path.startsWith("/api/eway")
  );
}

function isOrdersPath(path: string): boolean {
  return path === "/api/orders" || path.startsWith("/api/orders/");
}

function isLeadFormPath(path: string): boolean {
  return (
    path.startsWith("/api/consultation/") ||
    path === "/api/credit-application" ||
    path.startsWith("/api/credit-application/") ||
    path === "/api/catalogue-request" ||
    path.startsWith("/api/catalogue-request/") ||
    path.startsWith("/api/quote/") ||
    path.startsWith("/api/empower/")
  );
}

function isCatalogReadPath(path: string): boolean {
  return (
    path.startsWith("/api/products") ||
    path.startsWith("/api/categories") ||
    path.startsWith("/api/category-by-slug") ||
    path.startsWith("/api/brands/") ||
    path.startsWith("/api/filters/") ||
    path === "/api/price" ||
    path.startsWith("/api/price/")
  );
}

async function enforceLimit(
  ip: string,
  fp: string,
  routeKey: string,
  limit: number,
  windowSec: number = WINDOW_SEC
): Promise<NextResponse | null> {
  const r = await checkRateLimitSafe(ip, routeKey, limit, windowSec);
  if (r.ok === false) {
    logRateLimit(ip, routeKey, fp);
    return nextRateLimitResponse(r);
  }
  return null;
}

/**
 * Per-prefix limits (per IP, 60s window). One prefix bucket per request; global runs afterwards.
 */
export async function applyPerRouteApiRateLimits(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  const ip = getClientIp(req);
  const fp = fingerprintRequest(req);

  if (isTypesenseWritePath(path)) {
    return enforceLimit(ip, fp, "typesense-write", API_RATE.typesenseWrite);
  }
  if (path.startsWith("/api/revalidate")) {
    return enforceLimit(ip, fp, "revalidate", API_RATE.revalidate);
  }
  if (path.startsWith("/api/auth/")) {
    return enforceLimit(ip, fp, "auth", API_RATE.auth);
  }
  if (isContactPath(path)) {
    return enforceLimit(ip, fp, "contact", API_RATE.contact);
  }
  if (path.startsWith("/api/webhook")) {
    return enforceLimit(ip, fp, "webhook", API_RATE.webhook);
  }
  if (path.startsWith("/api/payment/")) {
    return enforceLimit(ip, fp, "payment", API_RATE.payment);
  }
  if (isCheckoutPath(path)) {
    return enforceLimit(ip, fp, "checkout", API_RATE.checkout);
  }
  if (isOrdersPath(path)) {
    return enforceLimit(ip, fp, "orders", API_RATE.orders);
  }
  if (isLeadFormPath(path)) {
    return enforceLimit(ip, fp, "lead-forms", API_RATE.leadForms);
  }
  if (path.startsWith("/api/dashboard/")) {
    return enforceLimit(ip, fp, "dashboard", API_RATE.dashboard);
  }
  if (path.startsWith("/api/wc/")) {
    return enforceLimit(ip, fp, "wc", API_RATE.wc);
  }
  if (path.startsWith("/api/cms/")) {
    return enforceLimit(ip, fp, "cms", API_RATE.cms);
  }
  if (path.startsWith("/api/shipping/")) {
    return enforceLimit(ip, fp, "shipping", API_RATE.shipping);
  }
  if (isCatalogReadPath(path)) {
    return enforceLimit(ip, fp, "catalog", API_RATE.catalog);
  }
  if (path.startsWith("/api/cart")) {
    return enforceLimit(ip, fp, "cart", API_RATE.cart);
  }
  if (isTypesenseSearchReadPath(path)) {
    return enforceLimit(ip, fp, "typesense-search", API_RATE.typesenseSearch);
  }
  if (path.startsWith("/api/analytics/")) {
    return enforceLimit(ip, fp, "analytics", API_RATE.analytics);
  }
  if (path.startsWith("/api/performance/")) {
    return enforceLimit(ip, fp, "performance", API_RATE.performance);
  }

  if (path.startsWith("/api/")) {
    return enforceLimit(ip, fp, "api-standard", standardPerMinute);
  }

  return null;
}

export async function applyGlobalApiRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const fp = fingerprintRequest(req);
  const r = await checkRateLimitSafe(ip, "global", globalPerMinute, WINDOW_SEC);
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
