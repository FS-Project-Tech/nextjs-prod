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
 * Google Tag Manager + gtag / GA4 (script + network beacons).
 * @see https://developers.google.com/tag-platform/security/guides/csp
 */
const GOOGLE_TAG_GA_SCRIPT_SRC =
  "https://www.googletagmanager.com https://www.google-analytics.com";

/** Google Ads — gtag loads conversion JS from doubleclick.net (blocked if missing from script-src). */
const GOOGLE_ADS_SCRIPT_SRC =
  "https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net";

const GOOGLE_TAG_GA_CONNECT_SRC =
  "https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://analytics.google.com https://*.analytics.google.com";

/** Google Ads conversion / remarketing (connect + beacons). */
const GOOGLE_ADS_CONNECT_SRC =
  "https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net";

const GOOGLE_TAG_GA_IMG_SRC =
  "https://www.google-analytics.com https://www.googletagmanager.com";

/**
 * Meta Pixel (Facebook) — fbevents.js + event endpoints.
 * @see https://developers.facebook.com/docs/facebook-pixel/advanced/
 */
const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net";

const META_PIXEL_CONNECT_SRC =
  "https://connect.facebook.net https://www.facebook.com https://graph.facebook.com https://*.facebook.com https://*.fbcdn.net";

const META_PIXEL_IMG_SRC = "https://www.facebook.com";

/**
 * Tawk.to live chat widget.
 * @see https://help.tawk.to/article/why-are-images-not-showing-up-in-the-widget
 */
const TAWK_SCRIPT_SRC = "https://*.tawk.to https://cdn.jsdelivr.net";

const TAWK_STYLE_SRC = "https://*.tawk.to https://cdn.jsdelivr.net";

const TAWK_FRAME_SRC = "https://*.tawk.to";

const TAWK_FONT_SRC = "https://*.tawk.to";

const TAWK_IMG_SRC =
  "https://*.tawk.to https://cdn.jsdelivr.net https://tawk.link https://s3.amazonaws.com https://*.s3.amazonaws.com";

const TAWK_CONNECT_SRC = "https://*.tawk.to wss://*.tawk.to";

const TAWK_FORM_ACTION = "https://*.tawk.to";

/**
 * Vercel Live feedback / toolbar scripts on preview deployments.
 * Keep scoped to vercel.live domains only.
 */
const VERCEL_LIVE_SCRIPT_SRC = "https://vercel.live https://*.vercel.live";
const VERCEL_LIVE_CONNECT_SRC = "https://vercel.live https://*.vercel.live wss://vercel.live wss://*.vercel.live";
const VERCEL_LIVE_FRAME_SRC = "https://vercel.live https://*.vercel.live";

/**
 * Content Security Policy
 * Note: 'unsafe-inline' for styles is needed for Next.js
 * Maps allowlist includes 'unsafe-eval' per Google's documented example (required for some API paths).
 */
export const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GOOGLE_MAPS_SCRIPT_SRC} ${GOOGLE_TAG_GA_SCRIPT_SRC} ${GOOGLE_ADS_SCRIPT_SRC} ${META_PIXEL_SCRIPT_SRC} ${TAWK_SCRIPT_SRC} ${VERCEL_LIVE_SCRIPT_SRC}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${TAWK_STYLE_SRC}`,
  `img-src 'self' data: https: blob: https://*.googleapis.com https://*.gstatic.com *.google.com *.googleusercontent.com ${GOOGLE_TAG_GA_IMG_SRC} ${META_PIXEL_IMG_SRC} ${TAWK_IMG_SRC}`,
  `font-src 'self' data: https: https://fonts.gstatic.com ${TAWK_FONT_SRC}`,
  `connect-src 'self' ${process.env.WC_API_URL ? new URL(process.env.WC_API_URL).origin : ""} https: https://*.googleapis.com *.google.com https://*.gstatic.com data: blob: ${GOOGLE_TAG_GA_CONNECT_SRC} ${GOOGLE_ADS_CONNECT_SRC} ${META_PIXEL_CONNECT_SRC} ${TAWK_CONNECT_SRC} ${VERCEL_LIVE_CONNECT_SRC}`.trim(),
  `frame-src *.google.com ${TAWK_FRAME_SRC} ${VERCEL_LIVE_FRAME_SRC}`,
  /** Same-origin service workers (e.g. /sw.js); blob for bundled/worklet-style workers. */
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${TAWK_FORM_ACTION}`,
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

