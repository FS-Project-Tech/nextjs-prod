/**
 * API Response Utilities
 * Standardized response helpers for API routes
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { ApiResponse, ApiErrorResponse, ApiSuccessResponse, ApiErrorCode } from '../types/api';
import { secureResponse } from '../security-headers';
import { applyCorsHeaders } from '../cors';
import { logger } from './logger';

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  options: {
    status?: number;
    message?: string;
    headers?: Record<string, string>;
    request?: NextRequest;
  } = {}
): NextResponse<ApiSuccessResponse<T>> {
  const { status = 200, message, headers = {}, request } = options;

  const response = secureResponse(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );

  return (request ? applyCorsHeaders(request, response) : response) as NextResponse<ApiSuccessResponse<T>>;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ApiErrorCode | string,
  message: string,
  options: {
    status?: number;
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
    request?: NextRequest;
    logError?: boolean;
    error?: Error;
  } = {}
): NextResponse<ApiErrorResponse> {
  const {
    status = 500,
    details,
    headers = {},
    request,
    logError = true,
    error,
  } = options;

  if (logError) {
    logger.error(message, 'API', { code, details }, error);
  }

  const response = secureResponse(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );

  return (request ? applyCorsHeaders(request, response) : response) as NextResponse<ApiErrorResponse>;
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(
  errors: Array<{ field: string; message: string }>,
  request?: NextRequest
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    'VALIDATION_ERROR',
    'Validation failed',
    {
      status: 400,
      details: { errors },
      request,
      logError: false, // Validation errors are expected, don't log as errors
    }
  );
}

/**
 * Create a rate limit error response
 */
export function createRateLimitResponse(
  request?: NextRequest,
  retryAfter?: number
): NextResponse<ApiErrorResponse> {
  const headers: Record<string, string> = {};
  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return createErrorResponse(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please try again later.',
    {
      status: 429,
      request,
      headers,
      logError: false, // Rate limits are expected, don't log as errors
    }
  );
}

/**
 * Create an unauthorized response
 */
export function createUnauthorizedResponse(
  message = 'Authentication required',
  request?: NextRequest
): NextResponse<ApiErrorResponse> {
  return createErrorResponse('UNAUTHORIZED', message, {
    status: 401,
    request,
    logError: false,
  });
}

/**
 * Create a forbidden response
 */
export function createForbiddenResponse(
  message = 'Access forbidden',
  request?: NextRequest
): NextResponse<ApiErrorResponse> {
  return createErrorResponse('FORBIDDEN', message, {
    status: 403,
    request,
    logError: false,
  });
}

/**
 * Create a not found response
 */
export function createNotFoundResponse(
  message = 'Resource not found',
  request?: NextRequest
): NextResponse<ApiErrorResponse> {
  return createErrorResponse('NOT_FOUND', message, {
    status: 404,
    request,
    logError: false,
  });
}

/**
 * Create an internal server error response
 */
export function createInternalErrorResponse(
  message = 'An internal error occurred',
  error?: Error,
  request?: NextRequest
): NextResponse<ApiErrorResponse> {
  return createErrorResponse('INTERNAL_ERROR', message, {
    status: 500,
    request,
    error,
    logError: true,
  });
}

