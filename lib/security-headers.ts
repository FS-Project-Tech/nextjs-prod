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
 * Content Security Policy
 * Note: 'unsafe-inline' for styles is needed for Next.js
 * In production, consider using nonces for scripts
 */
export const CSP_HEADER = [
  "default-src 'self'",
  // script-src: 'self' + 'unsafe-inline' needed for Next.js hydration
  // Avoid 'unsafe-eval' in production if possible
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https:",
  // Allow connections to WordPress backend
  `connect-src 'self' ${process.env.WC_API_URL ? new URL(process.env.WC_API_URL).origin : ''} https:`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'", // Block plugins
  "upgrade-insecure-requests",
].join('; ');

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

