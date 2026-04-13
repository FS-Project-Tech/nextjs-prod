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

    const response = NextResponse.next();
    return addSecurityHeadersToResponse(response);
  } catch (error) {
    console.error("[Middleware] Error:", error);
    const response = NextResponse.next();
    return addSecurityHeadersToResponse(response);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
