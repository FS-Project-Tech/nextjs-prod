/**
 * Security Headers Utility
 * Provides security headers for API responses and middleware
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
} as const;

/**
 * Content Security Policy
 * Note: 'unsafe-inline' for styles is needed for Next.js
 * In production, consider using nonces for scripts
 */
    const wcOrigin = process.env.WC_API_URL
      ? new URL(process.env.WC_API_URL).origin
      : "";

    export const CSP_HEADER = [
      "default-src 'self'",

      `script-src 'self' 'unsafe-inline'
        https://www.googletagmanager.com
        https://www.google-analytics.com
        https://connect.facebook.net
        https://embed.tawk.to`,

      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

      "img-src 'self' data: blob: https:",

      "font-src 'self' https://fonts.gstatic.com data:",

      // ✅ IMPORTANT PART
      `connect-src 'self'
        https://joyamedicalsupplies.com.au
        ${wcOrigin}
        https://www.google-analytics.com
        https://connect.facebook.net
        https://embed.tawk.to`,

      `frame-src https://embed.tawk.to`,

      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

/**
 * Apply security headers to a response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Only add CSP in production or when explicitly enabled
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CSP === "true") {
    response.headers.set("Content-Security-Policy", CSP_HEADER);
  }

  return response;
}

/**
 * Create secure response with security headers
 */
export function secureResponse(data: any, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(data, init);
  return applySecurityHeaders(response);
}

/**
 * Add security headers to middleware response
 */
export function addSecurityHeadersToResponse(response: NextResponse): NextResponse {
  return applySecurityHeaders(response);
}
