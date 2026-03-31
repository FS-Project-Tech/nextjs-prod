import { NextResponse, type NextRequest } from 'next/server';
// import { validateRedirect, ALLOWED_REDIRECT_PATHS } from '@/lib/redirectUtils';
import { addSecurityHeadersToResponse } from '@/lib/security-headers';

export function middleware(request: NextRequest) {
  try {
    const response = NextResponse.next();
    return addSecurityHeadersToResponse(response);
  } catch (error) {
    console.error("[Middleware] Error:", error);
    const response = NextResponse.next();
    return addSecurityHeadersToResponse(response);
  }
}

/**
 * Matcher configuration for middleware
 * Only runs on routes that match the pattern
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
