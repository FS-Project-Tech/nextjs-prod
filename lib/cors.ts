/**
 * CORS Configuration
 * Handles Cross-Origin Resource Sharing for API routes
 */

import { NextRequest, NextResponse } from 'next/server';

export interface CorsOptions {
  origin?: string | string[] | ((origin: string | null) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_OPTIONS: CorsOptions = {
  origin: process.env.NEXT_PUBLIC_SITE_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Check if origin is allowed
 */
function isOriginAllowed(
  origin: string | null,
  allowedOrigin: string | string[] | ((origin: string | null) => boolean) | undefined
): boolean {
  if (!origin) return false;
  if (!allowedOrigin || allowedOrigin === '*') return true;
  if (typeof allowedOrigin === 'function') return allowedOrigin(origin);
  if (Array.isArray(allowedOrigin)) return allowedOrigin.includes(origin);
  return allowedOrigin === origin;
}

/**
 * Apply CORS headers to response
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: NextResponse,
  options: CorsOptions = {}
): NextResponse {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const origin = request.headers.get('origin');

  // Check if origin is allowed
  if (origin && isOriginAllowed(origin, config.origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (config.origin === '*') {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }

  if (config.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (config.methods && config.methods.length > 0) {
    response.headers.set('Access-Control-Allow-Methods', config.methods.join(', '));
  }

  if (config.allowedHeaders && config.allowedHeaders.length > 0) {
    response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  }

  if (config.exposedHeaders && config.exposedHeaders.length > 0) {
    response.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  }

  if (config.maxAge) {
    response.headers.set('Access-Control-Max-Age', config.maxAge.toString());
  }

  return response;
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflight(
  request: NextRequest,
  options: CorsOptions = {}
): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const response = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(request, response, options);
}

