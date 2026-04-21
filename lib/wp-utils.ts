//D:\stage-joya\nextjs-stage\lib\wp-utils.ts

/**
 * WordPress Utilities (Client-Safe)
 * Shared utilities that don't require server-only APIs
 */

/**
 * Get WordPress base URL from environment
 * This is client-safe and can be used in both server and client components
 */
export function getWpBaseUrl(): string {
  const tries = [
    process.env.NEXT_PUBLIC_WP_URL,
    process.env.WORDPRESS_URL,
    process.env.WC_API_URL ? String(process.env.WC_API_URL).replace(/\/wp-json\/.*$/i, "") : "",
    process.env.WC_API_URL,
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  for (const raw of tries) {
    try {
      const url = new URL(raw.trim());
      return `${url.protocol}//${url.host}`.replace(/\/$/, "");
    } catch {
      /* try next */
    }
  }

  return "";
}
