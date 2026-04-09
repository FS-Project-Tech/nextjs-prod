import { NextResponse, type NextRequest } from "next/server";
import { proxy as addSecurityHeadersToResponse } from "@/lib/security-headers";

/**
 * Next.js 16+: `middleware.ts` is deprecated in favor of `proxy.ts`.
 * @see https://nextjs.org/docs/messages/middleware-to-proxy
 */
export function proxy(_request: NextRequest) {
  try {
    return addSecurityHeadersToResponse(_request);
  } catch (error) {
    console.error("[Proxy] Error:", error);
    return addSecurityHeadersToResponse(_request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
