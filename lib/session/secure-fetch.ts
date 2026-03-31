/**
 * Secure Fetch with Session Management
 * Handles authenticated requests with retry, timeout, and error handling
 */

import {
  SessionData,
  SessionFetchOptions,
  SessionFetchResult,
  SessionError,
  SessionErrorCode,
  SessionStatus,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  validateSession,
  createSessionError,
} from './manager';
import { normalizeError, isAbortError, isTimeoutError, getErrorMessage } from '@/lib/utils/errors';

/**
 * Request cache for deduplication - stores resolved data instead of promises
 * to avoid Response stream cloning issues in Node.js
 */
const requestCache = new Map<string, {
  data: unknown;
  status: number;
  timestamp: number;
}>();

const CACHE_DEDUP_WINDOW = 100; // 100ms window for request deduplication

/**
 * Pending request tracker to prevent duplicate in-flight requests
 */
const pendingRequests = new Map<string, Promise<{ data: unknown; status: number } | null>>();

/**
 * Generate cache key for request
 */
function generateCacheKey(url: string, options: RequestInit): string {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : '';
  return `${method}:${url}:${body}`;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attempt: number, baseDelay: number, backoff: number): number {
  return baseDelay * Math.pow(backoff, attempt);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown, status?: number): boolean {
  // Network errors are retryable
  if (error instanceof TypeError) {
    const message = getErrorMessage(error);
    if (message.includes('fetch')) {
      return true;
    }
  }
  
  // Timeout errors are retryable
  if (isAbortError(error) || isTimeoutError(error)) {
    return true;
  }
  
  // Server errors (5xx) are retryable
  if (status && status >= 500 && status < 600) {
    return true;
  }
  
  // Rate limiting (429) is retryable
  if (status === 429) {
    return true;
  }
  
  return false;
}

/**
 * Map HTTP status to session error
 */
function statusToSessionError(status: number, message?: string): SessionError {
  switch (status) {
    case 401:
      return createSessionError(
        SessionErrorCode.TOKEN_INVALID,
        message || 'Authentication required',
        false
      );
    case 403:
      return createSessionError(
        SessionErrorCode.TOKEN_REVOKED,
        message || 'Access denied',
        false
      );
    case 429:
      return createSessionError(
        SessionErrorCode.RATE_LIMITED,
        message || 'Too many requests',
        true
      );
    default:
      if (status >= 500) {
        return createSessionError(
          SessionErrorCode.SERVER_ERROR,
          message || 'Server error',
          true
        );
      }
      return createSessionError(
        SessionErrorCode.VALIDATION_FAILED,
        message || `Request failed with status ${status}`,
        false
      );
  }
}

/**
 * Create fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Secure fetch with session context
 * Handles authentication, retries, timeouts, and caching
 */
export async function secureFetch<T = unknown>(
  url: string,
  session: SessionData | null,
  options: SessionFetchOptions = {}
): Promise<SessionFetchResult<T>> {
  const {
    requireAuth = false,
    includeCart = false,
    skipCache = false,
    timeout = DEFAULT_SESSION_CONFIG.networkTimeout,
    retries = DEFAULT_SESSION_CONFIG.maxRetries,
    ...fetchOptions
  } = options;
  
  // Validate session if auth is required
  if (requireAuth) {
    const validation = validateSession(session);
    if (!validation.isValid) {
      return {
        data: null,
        error: validation.error || createSessionError(
          SessionErrorCode.TOKEN_INVALID,
          'Invalid session',
          false
        ),
        status: 401,
        cached: false,
        sessionValid: false,
      };
    }
  }
  
  // Build headers
  const headers = new Headers(fetchOptions.headers);
  
  // Add auth header if session has token
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }
  
  // Add CSRF token
  if (session?.csrfToken) {
    headers.set('X-CSRF-Token', session.csrfToken);
  }
  
  // Add cart session header if needed
  if (includeCart && session?.cart?.cartKey) {
    headers.set('X-WC-Session', session.cart.cartKey);
  }
  
  // Standard headers
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  
  const requestOptions: RequestInit = {
    ...fetchOptions,
    headers,
    credentials: 'include',
  };
  
  // Check for duplicate request (deduplication)
  const cacheKey = generateCacheKey(url, requestOptions);
  
  // Check if we have cached data from a recent identical request
  const cachedData = requestCache.get(cacheKey);
  if (!skipCache && cachedData) {
    const age = Date.now() - cachedData.timestamp;
    if (age < CACHE_DEDUP_WINDOW) {
      return {
        data: cachedData.data as T,
        error: null,
        status: cachedData.status,
        cached: true,
        sessionValid: true,
      };
    } else {
      requestCache.delete(cacheKey);
    }
  }
  
  // Check if there's a pending request for the same resource
  const pendingRequest = pendingRequests.get(cacheKey);
  if (!skipCache && pendingRequest) {
    try {
      const result = await pendingRequest;
      if (result) {
        return {
          data: result.data as T,
          error: null,
          status: result.status,
          cached: true,
          sessionValid: true,
        };
      }
    } catch {
      // Pending request failed, continue with new request
    }
  }
  
  // Retry loop
  let lastError: SessionError | null = null;
  let lastStatus = 0;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create the fetch promise
      const fetchPromise = fetchWithTimeout(url, requestOptions, timeout);
      
      const response = await fetchPromise;
      lastStatus = response.status;
      
      // Handle auth errors
      if (response.status === 401 || response.status === 403) {
        return {
          data: null,
          error: statusToSessionError(response.status),
          status: response.status,
          cached: false,
          sessionValid: false,
        };
      }
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter 
          ? parseInt(retryAfter, 10) * 1000 
          : getRetryDelay(attempt, DEFAULT_SESSION_CONFIG.retryDelay, DEFAULT_SESSION_CONFIG.retryBackoff);
        
        if (attempt < retries) {
          await sleep(delay);
          continue;
        }
        
        return {
          data: null,
          error: statusToSessionError(429),
          status: 429,
          cached: false,
          sessionValid: true,
        };
      }
      
      // Handle server errors with retry
      if (response.status >= 500 && attempt < retries) {
        const delay = getRetryDelay(attempt, DEFAULT_SESSION_CONFIG.retryDelay, DEFAULT_SESSION_CONFIG.retryBackoff);
        await sleep(delay);
        continue;
      }
      
      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage: string | undefined;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.message || errorBody.error;
        } catch {
          // Ignore JSON parse errors
        }
        
        return {
          data: null,
          error: statusToSessionError(response.status, errorMessage),
          status: response.status,
          cached: false,
          sessionValid: true,
        };
      }
      
      // Parse successful response
      let data: T | null = null;
      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('application/json')) {
        const text = await response.text();
        if (text.trim()) {
          try {
            data = JSON.parse(text) as T;
          } catch {
            // Clean up pending request tracker
            pendingRequests.delete(cacheKey);
            
            return {
              data: null,
              error: createSessionError(
                SessionErrorCode.VALIDATION_FAILED,
                'Invalid JSON response',
                false
              ),
              status: response.status,
              cached: false,
              sessionValid: true,
            };
          }
        }
      }
      
      // Cache the successful response data for deduplication
      if (!skipCache && data !== null) {
        requestCache.set(cacheKey, {
          data,
          status: response.status,
          timestamp: Date.now(),
        });
      }
      
      // Clean up pending request tracker
      pendingRequests.delete(cacheKey);
      
      return {
        data,
        error: null,
        status: response.status,
        cached: false,
        sessionValid: true,
      };
      
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      const retryable = isRetryableError(error);
      
      // Map AppError code to SessionErrorCode
      let sessionErrorCode: SessionErrorCode;
      switch (normalized.code) {
        case 'NETWORK_ERROR':
          sessionErrorCode = SessionErrorCode.NETWORK_ERROR;
          break;
        case 'TIMEOUT':
          sessionErrorCode = SessionErrorCode.NETWORK_ERROR;
          break;
        case 'AUTH_ERROR':
          sessionErrorCode = SessionErrorCode.TOKEN_INVALID;
          break;
        case 'RATE_LIMITED':
          sessionErrorCode = SessionErrorCode.RATE_LIMITED;
          break;
        case 'SERVER_ERROR':
          sessionErrorCode = SessionErrorCode.SERVER_ERROR;
          break;
        case 'VALIDATION_ERROR':
          sessionErrorCode = SessionErrorCode.VALIDATION_FAILED;
          break;
        default:
          sessionErrorCode = SessionErrorCode.NETWORK_ERROR;
      }
      
      lastError = createSessionError(sessionErrorCode, normalized.message, retryable);
      lastStatus = normalized.status || 0;
      
      // Retry if possible
      if (isRetryableError(error, lastStatus) && attempt < retries) {
        const delay = getRetryDelay(attempt, DEFAULT_SESSION_CONFIG.retryDelay, DEFAULT_SESSION_CONFIG.retryBackoff);
        await sleep(delay);
        continue;
      }
    }
  }
  
  // Clean up pending request tracker
  pendingRequests.delete(cacheKey);
  
  // All retries exhausted
  return {
    data: null,
    error: lastError || createSessionError(
      SessionErrorCode.NETWORK_ERROR,
      'Request failed after retries',
      false
    ),
    status: lastStatus,
    cached: false,
    sessionValid: session?.status === SessionStatus.VALID,
  };
}

/**
 * GET request with session
 */
export async function sessionGet<T = unknown>(
  url: string,
  session: SessionData | null,
  options: Omit<SessionFetchOptions, 'method' | 'body'> = {}
): Promise<SessionFetchResult<T>> {
  return secureFetch<T>(url, session, { ...options, method: 'GET' });
}

/**
 * POST request with session
 */
export async function sessionPost<T = unknown>(
  url: string,
  session: SessionData | null,
  body: unknown,
  options: Omit<SessionFetchOptions, 'method' | 'body'> = {}
): Promise<SessionFetchResult<T>> {
  return secureFetch<T>(url, session, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * PUT request with session
 */
export async function sessionPut<T = unknown>(
  url: string,
  session: SessionData | null,
  body: unknown,
  options: Omit<SessionFetchOptions, 'method' | 'body'> = {}
): Promise<SessionFetchResult<T>> {
  return secureFetch<T>(url, session, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request with session
 */
export async function sessionDelete<T = unknown>(
  url: string,
  session: SessionData | null,
  options: Omit<SessionFetchOptions, 'method'> = {}
): Promise<SessionFetchResult<T>> {
  return secureFetch<T>(url, session, { ...options, method: 'DELETE' });
}

/**
 * PATCH request with session
 */
export async function sessionPatch<T = unknown>(
  url: string,
  session: SessionData | null,
  body: unknown,
  options: Omit<SessionFetchOptions, 'method' | 'body'> = {}
): Promise<SessionFetchResult<T>> {
  return secureFetch<T>(url, session, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

