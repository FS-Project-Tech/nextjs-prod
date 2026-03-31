/**
 * API Middleware Utilities
 * Combines JWT auth, rate limiting, and response sanitization
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, optionalAuth, rateLimit, withTimeout, API_TIMEOUT as API_TIMEOUT_CONFIG } from './api-security';
import { sanitizeResponse, sanitizeError } from './sanitize';
import { getErrorMessage, isTimeoutError } from '@/lib/utils/errors';

// Export API_TIMEOUT for convenience (re-exported from api-security)
export const API_TIMEOUT = API_TIMEOUT_CONFIG;

/**
 * API Route Handler Wrapper
 * Applies security middleware to API routes
 */
export interface ApiHandlerOptions {
  requireAuth?: boolean;
  optionalAuth?: boolean;
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
  };
  timeout?: number;
  sanitize?: boolean;
  allowedMethods?: string[];
}

/**
 * Create secure API handler
 */
export function createApiHandler<T = any>(
  handler: (req: NextRequest, context: { user?: any; token?: string }) => Promise<NextResponse>,
  options: ApiHandlerOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Check allowed methods
      if (options.allowedMethods && !options.allowedMethods.includes(req.method)) {
        return NextResponse.json(
          { error: 'Method not allowed', message: `${req.method} is not allowed for this endpoint` },
          { status: 405 }
        );
      }

      // Apply rate limiting
      if (options.rateLimit) {
        const rateLimitMiddleware = rateLimit({
          windowMs: options.rateLimit.windowMs,
          maxRequests: options.rateLimit.maxRequests,
        });
        const rateLimitResponse = await rateLimitMiddleware(req);
        if (rateLimitResponse) {
          return rateLimitResponse;
        }
      }

      // Apply authentication
      let user: any = undefined;
      let token: string | undefined = undefined;

      if (options.requireAuth) {
        const authResult = await requireAuth(req);
        if (authResult instanceof NextResponse) {
          return authResult; // Auth failed
        }
        user = authResult.user;
        token = authResult.token;
      } else if (options.optionalAuth) {
        const authResult = await optionalAuth(req);
        if (authResult) {
          user = authResult.user;
          token = authResult.token;
        }
      }

      // Execute handler with timeout
      const timeout = options.timeout || API_TIMEOUT_CONFIG.DEFAULT;
      const handlerPromise = handler(req, { user, token });
      const operationName = `${req.method} ${req.nextUrl.pathname}`;
      const response = await withTimeout(handlerPromise, timeout, operationName);

      // Sanitize response if enabled
      if (options.sanitize && response) {
        const body = await response.json().catch(() => ({}));
        const sanitizedBody = sanitizeResponse(body);
        return NextResponse.json(sanitizedBody, {
          status: response.status,
          headers: response.headers,
        });
      }

      return response;
    } catch (error: unknown) {
      console.error('API handler error:', error);

      // Handle timeout errors
      if (isTimeoutError(error)) {
        return NextResponse.json(
          {
            error: 'Request timeout',
            message: 'The request took too long to complete. Please try again.',
          },
          { status: 504 }
        );
      }

      // Sanitize error response
      const sanitizedError = sanitizeError(error);
      return NextResponse.json(sanitizedError, {
        status: sanitizedError.status || 500,
      });
    }
  };
}

/**
 * Public API handler (no auth required, with rate limiting)
 */
export function createPublicApiHandler<T = any>(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: Omit<ApiHandlerOptions, 'requireAuth' | 'optionalAuth'> = {}
) {
  return createApiHandler(async (req) => handler(req), {
    ...options,
    requireAuth: false,
  });
}

/**
 * Protected API handler (auth required)
 * When requireAuth is true, user and token are guaranteed to be defined
 */
export function createProtectedApiHandler<T = any>(
  handler: (req: NextRequest, context: { user: any; token: string }) => Promise<NextResponse>,
  options: Omit<ApiHandlerOptions, 'requireAuth'> = {}
) {
  return createApiHandler(
    handler as (req: NextRequest, context: { user?: any; token?: string }) => Promise<NextResponse>,
    {
      ...options,
      requireAuth: true,
    }
  );
}

