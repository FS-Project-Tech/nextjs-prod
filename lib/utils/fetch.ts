/**
 * Unified Fetch Utilities
 * Consolidates fetch logic from api.ts, fetcher.ts, fetch-woo-data.ts
 */

// =============================================================================
// Types
// =============================================================================

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Number of retries on failure (default: 2) */
  retries?: number;
  /** Delay between retries in ms (default: 500) */
  retryDelay?: number;
  /** Fallback value if request fails */
  fallback?: unknown;
  /** Skip parsing JSON, return raw Response */
  raw?: boolean;
  /** Request body (will be JSON.stringify'd if object) */
  body?: BodyInit | Record<string, unknown> | null;
}

export interface FetchResult<T> {
  data: T | null;
  error: string | null;
  status: number;
  ok: boolean;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number = 0,
    public code: string = 'FETCH_ERROR'
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;

// Errors that should trigger retry
const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'fetch failed',
  'network',
  'timeout',
];

// =============================================================================
// Core Fetch Function
// =============================================================================

/**
 * Unified fetch with timeout, retry, and error handling
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    fallback,
    raw = false,
    body,
    ...fetchOptions
  } = options;

  // Prepare body
  const preparedBody = body && typeof body === 'object' && !(body instanceof FormData)
    ? JSON.stringify(body)
    : body as BodyInit | null | undefined;

  // Add default headers for JSON
  const headers = new Headers(fetchOptions.headers);
  if (preparedBody && typeof body === 'object' && !(body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  let lastError: Error | null = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: preparedBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      lastStatus = response.status;

      if (!response.ok) {
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const errorBody = await response.text().catch(() => '');
          return {
            data: fallback as T ?? null,
            error: errorBody || `HTTP ${response.status}`,
            status: response.status,
            ok: false,
          };
        }
        throw new FetchError(`HTTP ${response.status}`, response.status, 'HTTP_ERROR');
      }

      if (raw) {
        return {
          data: response as unknown as T,
          error: null,
          status: response.status,
          ok: true,
        };
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return {
          data: fallback as T ?? null,
          error: null,
          status: response.status,
          ok: true,
        };
      }

      const data = JSON.parse(text) as T;
      return {
        data,
        error: null,
        status: response.status,
        ok: true,
      };

    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = RETRYABLE_ERRORS.some(e => errorMessage.includes(e.toLowerCase()));
      const isAborted = lastError.name === 'AbortError';

      if (isAborted) {
        lastError = new FetchError('Request timeout', 0, 'TIMEOUT');
      }

      // Don't retry if not retryable or last attempt
      if (!isRetryable || attempt === retries) {
        break;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }

  // All retries exhausted
  return {
    data: fallback as T ?? null,
    error: lastError?.message || 'Unknown error',
    status: lastStatus,
    ok: false,
  };
}

/**
 * Simple fetch that throws on error (for backwards compatibility)
 */
export async function fetchJSON<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const result = await fetchWithRetry<T>(url, options);
  
  if (!result.ok || result.error) {
    throw new FetchError(result.error || 'Fetch failed', result.status);
  }
  
  return result.data as T;
}

/**
 * Fetch with automatic fallback (never throws)
 */
export async function fetchSafe<T>(
  url: string,
  fallback: T,
  options: FetchOptions = {}
): Promise<T> {
  const result = await fetchWithRetry<T>(url, { ...options, fallback });
  return result.data ?? fallback;
}

// =============================================================================
// URL Utilities
// =============================================================================

/**
 * Build URL with query parameters
 */
export function buildURL(base: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return base;
  
  const url = new URL(base, 'http://localhost');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  
  return url.pathname + url.search;
}

/**
 * Parse query string to object
 */
export function parseQuery(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

