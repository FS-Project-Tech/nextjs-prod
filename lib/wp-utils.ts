/**
 * WordPress Utilities (Client-Safe)
 * Shared utilities that don't require server-only APIs
 */

/**
 * Get WordPress base URL from environment
 * This is client-safe and can be used in both server and client components
 */
export function getWpBaseUrl(): string {
  const apiUrl = process.env.WC_API_URL || '';
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

