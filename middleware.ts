import { NextResponse, type NextRequest } from "next/server";
import { addSecurityHeadersToResponse } from "@/lib/security-headers";
import {
  applyGlobalApiRateLimit,
  applyPerRouteApiRateLimits,
  rejectBlockedBot,
  rejectUnlessTrustedOriginOrApiKey,
  rejectUntrustedApiMutation,
} from "@/lib/api-request-policy";

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
