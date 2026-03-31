/**
 * Secure Redirect Utilities
 * Prevents open redirect attacks by validating and sanitizing redirect URLs
 */

/**
 * Default safe redirect destination
 */
export const DEFAULT_REDIRECT = '/dashboard';

/**
 * Whitelist of allowed redirect paths (optional)
 * If provided, only paths in this list will be allowed
 */
export const ALLOWED_REDIRECT_PATHS = [
  '/my-account',
  '/dashboard',
  '/account',
  '/dashboard/orders',
  '/dashboard/addresses',
  '/dashboard/wishlist',
  '/dashboard/quotes',
  '/dashboard/settings',
  '/shop',
  '/cart',
  '/checkout',
] as const;

/**
 * Check if a string is a dangerous protocol
 */
function isDangerousProtocol(url: string): boolean {
  const dangerousProtocols = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
  ];
  
  const lowerUrl = url.toLowerCase().trim();
  return dangerousProtocols.some(protocol => lowerUrl.startsWith(protocol));
}

/**
 * Check if URL contains protocol (http://, https://, //)
 */
function hasProtocol(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('ftp://') ||
    trimmed.startsWith('mailto:')
  );
}

/**
 * Sanitize URL by removing dangerous characters and normalizing
 */
function sanitizeUrl(url: string): string {
  // Remove null bytes and control characters
  let sanitized = url.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove leading/trailing whitespace
  sanitized = sanitized.trim();
  
  // Remove multiple slashes (except at start for absolute paths)
  sanitized = sanitized.replace(/\/{2,}/g, '/');
  
  // Remove query string and hash (we only want the path)
  const pathOnly = sanitized.split('?')[0].split('#')[0];
  
  return pathOnly;
}

/**
 * Validate and sanitize a redirect URL
 * 
 * @param url - The redirect URL to validate
 * @param allowedPaths - Optional whitelist of allowed paths
 * @param defaultPath - Default path if validation fails
 * @returns Validated and sanitized redirect path
 * 
 * @example
 * validateRedirect('/dashboard') // Returns '/dashboard'
 * validateRedirect('//evil.com') // Returns '/dashboard' (default)
 * validateRedirect('javascript:alert(1)') // Returns '/dashboard' (default)
 */
export function validateRedirect(
  url: string | null | undefined,
  allowedPaths?: readonly string[],
  defaultPath: string = DEFAULT_REDIRECT
): string {
  // Return default if URL is empty
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return defaultPath;
  }

  const trimmed = url.trim();

  // Reject dangerous protocols
  if (isDangerousProtocol(trimmed)) {
    console.warn('[Redirect] Rejected dangerous protocol:', trimmed);
    return defaultPath;
  }

  // Reject URLs with protocols (http://, https://, //)
  if (hasProtocol(trimmed)) {
    console.warn('[Redirect] Rejected URL with protocol:', trimmed);
    return defaultPath;
  }

  // Sanitize the URL
  let sanitized = sanitizeUrl(trimmed);

  // Must start with / (relative path)
  if (!sanitized.startsWith('/')) {
    sanitized = `/${sanitized}`;
  }

  // Reject paths that try to escape (../, ..\\)
  if (sanitized.includes('../') || sanitized.includes('..\\')) {
    console.warn('[Redirect] Rejected path traversal attempt:', sanitized);
    return defaultPath;
  }

  // Reject paths with encoded characters that could be dangerous
  try {
    const decoded = decodeURIComponent(sanitized);
    if (decoded.includes('../') || decoded.includes('..\\') || hasProtocol(decoded)) {
      console.warn('[Redirect] Rejected encoded dangerous path:', sanitized);
      return defaultPath;
    }
  } catch {
    // Invalid encoding, reject
    console.warn('[Redirect] Rejected invalid encoding:', sanitized);
    return defaultPath;
  }

  // If whitelist is provided, check against it
  if (allowedPaths && allowedPaths.length > 0) {
    // Check exact match or prefix match for sub-routes
    const isAllowed = allowedPaths.some(allowed => {
      // Exact match
      if (sanitized === allowed) {
        return true;
      }
      // Sub-route match (e.g., /dashboard/orders matches /dashboard)
      if (sanitized.startsWith(`${allowed}/`)) {
        return true;
      }
      return false;
    });

    if (!isAllowed) {
      console.warn('[Redirect] Rejected path not in whitelist:', sanitized);
      return defaultPath;
    }
  }

  return sanitized;
}

/**
 * Validate redirect from query parameter
 * Convenience function for handling 'next' query parameter
 * 
 * @param nextParam - The 'next' query parameter value
 * @param allowedPaths - Optional whitelist of allowed paths
 * @returns Validated redirect path
 */
export function validateNextParam(
  nextParam: string | null | undefined,
  allowedPaths?: readonly string[],
  defaultPath: string = DEFAULT_REDIRECT
): string {
  return validateRedirect(nextParam, allowedPaths, defaultPath);
}

/**
 * Check if a redirect path is safe (without actually redirecting)
 * Useful for validation before storing or using redirect URLs
 */
export function isSafeRedirect(
  url: string | null | undefined,
  allowedPaths?: readonly string[]
): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();

  // Check dangerous protocols
  if (isDangerousProtocol(trimmed)) {
    return false;
  }

  // Check for protocols
  if (hasProtocol(trimmed)) {
    return false;
  }

  // Check path traversal
  if (trimmed.includes('../') || trimmed.includes('..\\')) {
    return false;
  }

  // Must start with /
  if (!trimmed.startsWith('/')) {
    return false;
  }

  // Check whitelist if provided
  if (allowedPaths && allowedPaths.length > 0) {
    const sanitized = sanitizeUrl(trimmed);
    const isAllowed = allowedPaths.some(allowed => {
      return sanitized === allowed || sanitized.startsWith(`${allowed}/`);
    });
    if (!isAllowed) {
      return false;
    }
  }

  return true;
}

