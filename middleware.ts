import { NextResponse, type NextRequest } from "next/server";
import { addSecurityHeadersToResponse } from "@/lib/security-headers";
import { isTrustedApiOrigin, rejectUnlessTrustedOriginOrApiKey } from "@/lib/api-public-guards";
import { checkRateLimitSafe, fingerprintRequest, getClientIp } from "@/lib/rate-limit";
import { getRateLimitIdentity } from "@/lib/rate-limit-identity";
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

/** Hard cap per IP for all `/api/*` traffic (60s window). */
const GLOBAL_RATE_PER_MINUTE = 100;
/** Fallback bucket for `/api/*` routes without a tighter prefix rule (60s window). */
const API_STANDARD_RATE_PER_MINUTE = 120;

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

function rejectBlockedBot(req: NextRequest): NextResponse | null {
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

async function applyPerRouteApiRateLimits(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  /** Checkout is limited in route handlers; skip middleware buckets to avoid double 429s. */
  if (path.startsWith("/api/checkout")) return null;

  const fp = fingerprintRequest(req);
  const id = await getRateLimitIdentity(req);

  if (path.startsWith("/api/auth/")) {
    const r = await checkRateLimitSafe(id, "auth", 10, 60);
    if (r.ok === false) {
      logRateLimit(id, "auth", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (isContactPath(path)) {
    const r = await checkRateLimitSafe(id, "contact", 5, 60);
    if (r.ok === false) {
      logRateLimit(id, "contact", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (isTypesenseSearchReadPath(path)) {
    const r = await checkRateLimitSafe(id, "typesense-search", 60, 60);
    if (r.ok === false) {
      logRateLimit(id, "typesense-search", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (path.startsWith("/api/cart")) {
    const r = await checkRateLimitSafe(id, "cart", 120, 60);
    if (r.ok === false) {
      console.warn("[middleware] rate-limit soft-fail (cart bucket)", { path, fp });
    }
  }

  if (path.startsWith("/api/")) {
    const r = await checkRateLimitSafe(id, "api-standard", API_STANDARD_RATE_PER_MINUTE, 60);
    if (r.ok === false) {
      if (path.startsWith("/api/cart")) {
        console.warn("[middleware] rate-limit soft-fail (api-standard, cart)", { path, fp });
        return null;
      }
      logRateLimit(id, "api-standard", fp);
      return nextRateLimitResponse(r);
    }
  }

  return null;
}

async function applyGlobalApiRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/checkout")) return null;

  const fp = fingerprintRequest(req);
  const id = await getRateLimitIdentity(req);
  const r = await checkRateLimitSafe(id, "global", GLOBAL_RATE_PER_MINUTE, 60);
  if (r.ok === false) {
    if (path.startsWith("/api/cart")) {
      console.warn("[middleware] rate-limit soft-fail (global, cart)", { path, fp });
      return null;
    }
    logRateLimit(id, "global", fp);
    return nextRateLimitResponse(r);
  }
  return null;
}

function shouldSkipCrossSiteGuard(pathname: string): boolean {
  return API_SKIP_CROSS_SITE_GUARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function rejectUntrustedApiMutation(req: NextRequest): NextResponse | null {
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

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    if (pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return addSecurityHeadersToResponse(NextResponse.next());
      }

      const bot = rejectBlockedBot(request);
      if (bot) return addSecurityHeadersToResponse(bot);

      const perRoute = await applyPerRouteApiRateLimits(request);
      if (perRoute) return addSecurityHeadersToResponse(perRoute);

      const globalRl = await applyGlobalApiRateLimit(request);
      if (globalRl) return addSecurityHeadersToResponse(globalRl);

      const apiKeyBlock = rejectUnlessTrustedOriginOrApiKey(request);
      if (apiKeyBlock) return addSecurityHeadersToResponse(apiKeyBlock);

      const mutationBlock = rejectUntrustedApiMutation(request);
      if (mutationBlock) return addSecurityHeadersToResponse(mutationBlock);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    return addSecurityHeadersToResponse(response);
  } catch (error) {
    console.error("[Middleware] Error:", error);
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return addSecurityHeadersToResponse(
        NextResponse.json(
          {
            error: "Service temporarily unavailable",
            code: "API_UNAVAILABLE",
            message: "Please retry shortly.",
          },
          {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "5",
            },
          }
        )
      );
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", request.nextUrl.pathname);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    return addSecurityHeadersToResponse(response);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
