/**
 * Response Sanitization Utilities
 * Sanitizes API responses to prevent XSS and data leakage
 */

/**
 * Sanitize string - remove HTML tags and dangerous characters
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"&]/g, '') // Remove dangerous characters
    .trim();
}

/**
 * Sanitize HTML - allow safe HTML but remove scripts
 * @deprecated Use sanitizeHTML from '@/lib/xss-sanitizer' for better security
 * This function is kept for backward compatibility but delegates to DOMPurify-based implementation
 */
export function sanitizeHTML(input: string | null | undefined): string {
  // Re-export from xss-sanitizer for backward compatibility
  // DOMPurify is more secure than regex-based sanitization
  const { sanitizeHTML: sanitizeHTMLSecure } = require('@/lib/xss-sanitizer');
  return sanitizeHTMLSecure(input);
}

/**
 * Sanitize number - ensure it's a valid number
 */
export function sanitizeNumber(input: any): number | null {
  if (typeof input === 'number' && isFinite(input)) {
    return input;
  }
  if (typeof input === 'string') {
    const parsed = parseFloat(input);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Sanitize URL - validate and clean URL
 */
export function sanitizeURL(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  
  try {
    const url = new URL(input);
    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize email - validate email format
 */
export function sanitizeEmail(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned = input.trim().toLowerCase();
  
  return emailRegex.test(cleaned) ? cleaned : null;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  options: {
    allowHTML?: boolean;
    allowedKeys?: string[];
    removeKeys?: string[];
  } = {}
): Partial<T> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj as Partial<T>;
  }

  const { allowHTML = false, allowedKeys, removeKeys = [] } = options;
  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip removed keys
    if (removeKeys.includes(key)) continue;

    // Skip if not in allowed keys (if specified)
    if (allowedKeys && !allowedKeys.includes(key)) continue;

    // Sanitize based on type
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = allowHTML ? sanitizeHTML(value) : sanitizeString(value);
    } else if (typeof value === 'number') {
      sanitized[key] = sanitizeNumber(value);
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'object' ? sanitizeObject(item, options) : item
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, options);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as Partial<T>;
}

/**
 * Sanitize product data
 */
export function sanitizeProduct(product: any): any {
  if (!product || typeof product !== 'object') return null;

  return sanitizeObject(product, {
    allowHTML: true, // Allow HTML in descriptions
    removeKeys: [
      // Remove sensitive fields
      'password',
      'secret',
      'api_key',
      'private_key',
      'access_token',
    ],
  });
}

/**
 * Sanitize user data
 */
export function sanitizeUser(user: any): any {
  if (!user || typeof user !== 'object') return null;

  return sanitizeObject(user, {
    removeKeys: [
      // Remove sensitive user fields
      'password',
      'password_hash',
      'secret',
      'api_key',
      'private_key',
      'access_token',
      'refresh_token',
      'session_token',
    ],
  });
}

/**
 * Sanitize API response
 */
export function sanitizeResponse<T>(data: T, options?: {
  allowHTML?: boolean;
  allowedKeys?: string[];
  removeKeys?: string[];
}): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return (options?.allowHTML ? sanitizeHTML(data) : sanitizeString(data)) as T;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item, options)) as T;
  }

  if (typeof data === 'object') {
    return sanitizeObject(data as Record<string, any>, options || {}) as T;
  }

  return data;
}

/**
 * Remove sensitive data from error responses
 */
export function sanitizeError(error: any): {
  error: string;
  message?: string;
  status?: number;
} {
  const sanitized: any = {
    error: 'An error occurred',
  };

  if (error && typeof error === 'object') {
    if ((error instanceof Error ? error.message : 'An error occurred') && typeof error.message === 'string') {
      sanitized.message = sanitizeString(error.message);
    }
    if (typeof error.status === 'number') {
      sanitized.status = error.status;
    }
    if (error.error && typeof error.error === 'string') {
      sanitized.error = sanitizeString(error.error);
    }
  } else if (typeof error === 'string') {
    sanitized.message = sanitizeString(error);
  }

  return sanitized;
}