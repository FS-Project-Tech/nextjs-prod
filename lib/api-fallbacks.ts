/**
 * Fallback Images and Default Values
 * Provides fallback images for logo failures and other common fallbacks
 */

/**
 * Default fallback logo (SVG data URI)
 */
export const FALLBACK_LOGO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="60" fill="#0f766e"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle">Logo</text>
  </svg>`
).toString('base64')}`;

/**
 * Default fallback image (SVG placeholder)
 */
export const FALLBACK_IMAGE = `data:image/svg+xml;base64,${Buffer.from(
  `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="300" fill="#e5e7eb"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">Image not available</text>
  </svg>`
).toString('base64')}`;

/**
 * Get fallback logo URL
 */
export function getFallbackLogo(): string {
  // Try environment variable first
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_HEADER_LOGO) {
    return process.env.NEXT_PUBLIC_HEADER_LOGO;
  }
  
  // Return SVG fallback
  return FALLBACK_LOGO;
}

/**
 * Get fallback image URL
 */
export function getFallbackImage(): string {
  // Try environment variable if available
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FALLBACK_IMAGE) {
    return process.env.NEXT_PUBLIC_FALLBACK_IMAGE;
  }
  
  // Return SVG fallback
  return FALLBACK_IMAGE;
}

/**
 * Safe image URL with fallback
 */
export function safeImageUrl(url: string | null | undefined, fallback?: string): string {
  if (!url || url.trim() === '') {
    return fallback || getFallbackImage();
  }
  
  // Check if URL is valid
  try {
    new URL(url);
    return url;
  } catch {
    // Invalid URL, return fallback
    return fallback || getFallbackImage();
  }
}

/**
 * Safe logo URL with fallback
 */
export function safeLogoUrl(url: string | null | undefined, fallback?: string): string {
  if (!url || url.trim() === '') {
    return fallback || getFallbackLogo();
  }
  
  // Check if URL is valid
  try {
    new URL(url);
    return url;
  } catch {
    // Invalid URL, return fallback
    return fallback || getFallbackLogo();
  }
}

