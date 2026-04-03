import { getWpBaseUrl } from "@/lib/wp-utils";

/** Public WordPress store URL for redirects (no trailing slash). */
export function getWooStorefrontUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WP_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const fromApi = getWpBaseUrl().replace(/\/+$/, "");
  return fromApi || "";
}
