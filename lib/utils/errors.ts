/**
 * Unified Error Handling Utilities
 * Consolidates error handling patterns across the codebase
 */

// =============================================================================
// Error Types
// =============================================================================

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  status: number;
  details?: Record<string, unknown>;
}

// =============================================================================
// Error Classes
// =============================================================================

export class BaseError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly userMessage: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = 'UNKNOWN',
    status: number = 500,
    userMessage?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.userMessage = userMessage || getDefaultUserMessage(code);
    this.details = details;
  }

  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      status: this.status,
      details: this.details,
    };
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, 'Please check your input and try again.', details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends BaseError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401, 'Please sign in to continue.');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404, `The requested ${resource.toLowerCase()} could not be found.`);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends BaseError {
  constructor(retryAfter?: number) {
    super(
      'Rate limit exceeded',
      'RATE_LIMITED',
      429,
      `Too many requests. Please try again ${retryAfter ? `in ${retryAfter} seconds` : 'later'}.`,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends BaseError {
  constructor(message: string = 'Network request failed') {
    super(message, 'NETWORK_ERROR', 0, 'Unable to connect. Please check your internet connection.');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends BaseError {
  constructor(timeoutMs?: number) {
    super(
      `Request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`,
      'TIMEOUT',
      0,
      'The request took too long. Please try again.'
    );
    this.name = 'TimeoutError';
  }
}

// =============================================================================
// Error Utilities
// =============================================================================

function getDefaultUserMessage(code: ErrorCode): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return 'Unable to connect. Please check your internet connection.';
    case 'TIMEOUT':
      return 'The request took too long. Please try again.';
    case 'VALIDATION_ERROR':
      return 'Please check your input and try again.';
    case 'AUTH_ERROR':
      return 'Please sign in to continue.';
    case 'NOT_FOUND':
      return 'The requested resource could not be found.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please try again later.';
    case 'SERVER_ERROR':
      return 'Something went wrong. Please try again later.';
    default:
      return 'An unexpected error occurred.';
  }
}

/**
 * Check if error is an AbortError (timeout/cancellation)
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

/**
 * Check if error is a timeout error (various forms)
 */
export function isTimeoutError(error: unknown): boolean {
  if (isAbortError(error)) {
    return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('timeout') || 
         message.includes('exceeded') || 
         message.includes('aborted') ||
         message.includes('econnaborted') ||
         message.includes('etimedout');
}

/**
 * Get error name safely
 */
export function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String(error.name);
  }
  return 'Unknown';
}

/**
 * Check if error has axios-style response property
 */
export function hasAxiosResponse(error: unknown): error is { 
  response?: { 
    status?: number; 
    statusText?: string; 
    data?: unknown;
  };
  config?: { url?: string; method?: string; params?: unknown };
  code?: string;
  message?: string;
} {
  return error !== null && 
         typeof error === 'object' && 
         'response' in error;
}

/**
 * Get axios error details safely
 */
export function getAxiosErrorDetails(error: unknown): {
  status?: number;
  statusText?: string;
  data?: unknown;
  url?: string;
  method?: string;
  code?: string;
  message: string;
} {
  if (!hasAxiosResponse(error)) {
    return { message: getErrorMessage(error) };
  }

  const response = error.response;
  const config = error.config;
  
  return {
    status: response?.status,
    statusText: response?.statusText,
    data: response?.data,
    url: config?.url,
    method: config?.method,
    code: error.code,
    message: error.message || getErrorMessage(error),
  };
}

/**
 * Convert any error to AppError (enhanced version)
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof BaseError) {
    return error.toJSON();
  }

  // Handle AbortError/timeout
  if (isAbortError(error)) {
    return new TimeoutError().toJSON();
  }

  // Handle axios-style errors
  if (hasAxiosResponse(error)) {
    const details = getAxiosErrorDetails(error);
    const status = details.status || 500;
    
    if (status === 401 || status === 403) {
      return new AuthError(details.message).toJSON();
    }
    if (status === 404) {
      return new NotFoundError().toJSON();
    }
    if (status === 429) {
      return new RateLimitError().toJSON();
    }
    if (status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: details.message,
        userMessage: 'A server error occurred. Please try again later.',
        status,
        details: { url: details.url, data: details.data },
      };
    }
    
    // Check for timeout codes
    if (details.code === 'ECONNABORTED' || 
        details.code === 'ETIMEDOUT' || 
        details.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        isTimeoutError(error)) {
      return new TimeoutError().toJSON();
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Detect error type from message
    if (isTimeoutError(error)) {
      return new TimeoutError().toJSON();
    }
    if (message.includes('network') || message.includes('fetch failed')) {
      return new NetworkError(error.message).toJSON();
    }
    if (message.includes('401') || message.includes('unauthorized')) {
      return new AuthError(error.message).toJSON();
    }
    if (message.includes('404') || message.includes('not found')) {
      return new NotFoundError().toJSON();
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return new RateLimitError().toJSON();
    }

    return {
      code: 'UNKNOWN',
      message: error.message,
      userMessage: 'An unexpected error occurred.',
      status: 500,
    };
  }

  return {
    code: 'UNKNOWN',
    message: String(error),
    userMessage: 'An unexpected error occurred.',
    status: 500,
  };
}

/**
 * Safe error handler that logs and returns user-friendly message
 */
export function handleError(error: unknown, context?: string): string {
  const normalized = normalizeError(error);
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context || 'Error'}]`, normalized);
  }
  
  return normalized.userMessage;
}

/**
 * Check if error is a specific type
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  if (error instanceof BaseError) {
    return error.code === code;
  }
  return false;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const normalized = normalizeError(error);
  return ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'].includes(normalized.code);
}

/**
 * Safely execute async function with error handling
 */
export async function trySafe<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Safely execute async function, return tuple [data, error]
 */
export async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<[T | null, AppError | null]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (error) {
    return [null, normalizeError(error)];
  }
}

/**
 * Get error message from unknown error type
 * Use in catch blocks: catch (error) { const message = getErrorMessage(error); }
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}

/**
 * Get error details from unknown error (includes response data for API errors)
 */
export function getErrorDetails(error: unknown): { message: string; status?: number; code?: string } {
  if (error instanceof Error) {
    // Check for axios/fetch response errors
    const axiosError = error as { response?: { data?: { message?: string; code?: string }; status?: number } };
    if (axiosError.response) {
      return {
        message: axiosError.response.data?.message || error.message,
        status: axiosError.response.status,
        code: axiosError.response.data?.code,
      };
    }
    return { message: error.message };
  }
  return { message: getErrorMessage(error) };
}

