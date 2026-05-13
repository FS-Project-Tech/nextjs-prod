import "@/lib/rate-limit-backend";
import { NextResponse, type NextRequest } from "next/server";
import { addSecurityHeadersToResponse } from "@/lib/security-headers";
import { checkRateLimitSafe, fingerprintRequest, getClientIp } from "@/lib/rate-limit";
import { getRateLimitIdentity } from "@/lib/rate-limit-identity";
import { logBlockedBot, logRateLimit } from "@/lib/api-logging";
import type { RateLimitBackendResult } from "@/lib/api-rate-limit";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Obvious SEO / crawl bots only — do not match normal browsers. */
const BAD_BOT_UA = /amazonbot|semrush|ahrefs|mj12bot/i;

const PUBLIC_PATHS = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/robots.txt",
];

const TRUSTED_BOTS = [
  /googlebot/i,
  /google-inspectiontool/i,
  /adsbot-google/i,
  /googleother/i,
  /bingbot/i,
  /duckduckbot/i,
];

const API_SKIP_CROSS_SITE_GUARD_PREFIXES: string[] = [
  "/api/auth/",
  "/api/webhook",
  "/api/payment/eway/webhook",
  "/api/revalidate",
  "/api/typesense/search/sync",
  "/api/typesense/search/delete",
];

const IP_WHITELIST = new Set(
  (process.env.IP_WHITELIST || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
);

/** Hard cap per identity for all `/api/*` traffic (60s window). */
const GLOBAL_RATE_PER_MINUTE = 100;
/** Fallback bucket for `/api/*` routes without a tighter prefix rule (60s window). */
const API_STANDARD_RATE_PER_MINUTE = 120;

function isSafeOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const allowed = [
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_FRONTEND_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    ].filter(Boolean) as string[];

    return allowed.some((o) => origin.includes(o));
  } catch {
    return true;
  }
}

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
  if (!BAD_BOT_UA.test(ua)) return null;

  const ip = getClientIp(req);
  logBlockedBot(ua, ip);
  console.warn("[middleware] bot blocked", { ua: ua.slice(0, 200) });
  return NextResponse.json({ error: "Bot traffic not allowed" }, { status: 403 });
}

/** GET search proxy only — excluded from api-standard + global caps. Sync/delete stay limited. */
function isTypesenseSearchReadPath(path: string): boolean {
  if (!path.startsWith("/api/typesense/search")) return false;
  // if (path.startsWith("/api/typesense/search/sync")) return false;
  // if (path.startsWith("/api/typesense/search/delete")) return false;
  return true;
}

/** Woo-backed shop listing GET — same rate-limit treatment as Typesense search reads. */
function isCatalogWooListingReadPath(path: string): boolean {
  return path === "/api/catalog/woo-listing";
}

function isListingCatalogReadPath(path: string): boolean {
  return isTypesenseSearchReadPath(path) || isCatalogWooListingReadPath(path);
}

function isContactPath(path: string): boolean {
  return path === "/api/contact" || path.startsWith("/api/contact/");
}

function shouldSkipCrossSiteGuard(pathname: string): boolean {
  return API_SKIP_CROSS_SITE_GUARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** Non-blocking: log suspicious mutations; never 403 from origin / Sec-Fetch alone. */
function logSuspiciousApiMutation(req: NextRequest): void {
  if (req.method === "OPTIONS") return;
  if (!MUTATION_METHODS.has(req.method)) return;

  const path = req.nextUrl.pathname;
  if (shouldSkipCrossSiteGuard(path)) return;

  const secFetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (secFetchSite === "cross-site") {
    console.warn("[middleware] cross-site API mutation (allowed)", { path, secFetchSite });
  }

  const origin = req.headers.get("origin");
  if (origin && !isSafeOrigin(req)) {
    console.warn("[middleware] untrusted origin on API mutation (allowed)", {
      path,
      origin,
    });
  }
}

async function applyPerRouteApiRateLimits(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/checkout")) return null;

  const fp = fingerprintRequest(req);
  const id = await getRateLimitIdentity(req);

  if (path.startsWith("/api/auth/")) {
    const r = await checkRateLimitSafe(id, "auth", 60, 60);
    if (r.ok === false) {
      console.warn("Rate limit exceeded", { bucket: "auth", id: fp });
      logRateLimit(id, "auth", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (isContactPath(path)) {
    const r = await checkRateLimitSafe(id, "contact", 60, 60);
    if (r.ok === false) {
      console.warn("Rate limit exceeded", { bucket: "contact", id: fp });
      logRateLimit(id, "contact", fp);
      return nextRateLimitResponse(r);
    }
  }

  if (path.startsWith("/api/cart")) {
    const r = await checkRateLimitSafe(id, "cart", 120, 60);
    if (r.ok === false) {
      console.warn("[middleware] rate-limit soft-fail (cart bucket)", { path, fp });
    }
  }

  if (path.startsWith("/api/") && !isListingCatalogReadPath(path)) {
    const r = await checkRateLimitSafe(id, "api-standard", API_STANDARD_RATE_PER_MINUTE, 60);
    if (r.ok === false) {
      if (path.startsWith("/api/cart")) {
        console.warn("[middleware] rate-limit soft-fail (api-standard, cart)", { path, fp });
        return null;
      }
      console.warn("Rate limit exceeded", { bucket: "api-standard", id: fp });
      logRateLimit(id, "api-standard", fp);
      return nextRateLimitResponse(r);
    }
  }

  return null;
}

async function applyGlobalApiRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/checkout")) return null;
  if (isListingCatalogReadPath(path)) return null;

  const fp = fingerprintRequest(req);
  const id = await getRateLimitIdentity(req);
  const r = await checkRateLimitSafe(id, "global", GLOBAL_RATE_PER_MINUTE, 60);
  if (r.ok === false) {
    if (path.startsWith("/api/cart")) {
      console.warn("[middleware] rate-limit soft-fail (global, cart)", { path, fp });
      return null;
    }
    console.warn("Rate limit exceeded", { bucket: "global", id: fp });
    logRateLimit(id, "global", fp);
    return nextRateLimitResponse(r);
  }
  return null;
}

async function handleMiddleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons")
  ) {
    return addSecurityHeadersToResponse(NextResponse.next());
  }

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

    logSuspiciousApiMutation(request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return addSecurityHeadersToResponse(response);
}

export async function middleware(request: NextRequest) {
  try {
    return await handleMiddleware(request);
  } catch (error) {
    console.error("[Middleware Error]", error);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", request.nextUrl.pathname);
    return addSecurityHeadersToResponse(
      NextResponse.next({
        request: { headers: requestHeaders },
      })
    );
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest)$).*)",
  ],
};
