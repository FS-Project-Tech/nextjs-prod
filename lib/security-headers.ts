/**
 * Security Headers Utility
 * Provides security headers for API responses and middleware
 */

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
} as const;

/**
 * Google Maps JavaScript API + Places (allowlist CSP).
 * @see https://developers.google.com/maps/documentation/javascript/content-security-policy
 * googleapis.com must appear in CSP (required since Q2 2023).
 */
const GOOGLE_MAPS_SCRIPT_SRC =
  "https://*.googleapis.com https://*.gstatic.com *.google.com https://*.ggpht.com *.googleusercontent.com blob:";

/**
 * Content Security Policy
 * Note: 'unsafe-inline' for styles is needed for Next.js
 * Maps allowlist includes 'unsafe-eval' per Google's documented example (required for some API paths).
 */
export const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GOOGLE_MAPS_SCRIPT_SRC}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob: https://*.googleapis.com https://*.gstatic.com *.google.com *.googleusercontent.com",
  "font-src 'self' data: https: https://fonts.gstatic.com",
  `connect-src 'self' ${process.env.WC_API_URL ? new URL(process.env.WC_API_URL).origin : ""} https: https://*.googleapis.com *.google.com https://*.gstatic.com data: blob:`.trim(),
  "frame-src *.google.com",
  "worker-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Apply security headers to a response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Only add CSP in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CSP === 'true') {
    response.headers.set('Content-Security-Policy', CSP_HEADER);
  }
  
  return response;
}

/**
 * Create secure response with security headers
 */
export function secureResponse(
  data: any,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(data, init);
  return applySecurityHeaders(response);
}

/**
 * Add security headers to middleware response
 */
export function addSecurityHeadersToResponse(response: NextResponse): NextResponse {
  return applySecurityHeaders(response);
}

