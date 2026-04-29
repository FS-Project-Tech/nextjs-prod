/** Public site origin for canonical / Open Graph (avoids localhost in production metadata). */
export function getPublicSiteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) return raw;
  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return raw || "";
}

/**
 * Canonical origin for sitemap URLs. Uses NEXT_PUBLIC_SITE_URL when it is not
 * localhost; otherwise falls back to production so local dev does not emit
 * http://localhost in /sitemap.xml (set env per environment for stage vs live).
 */
export function getSitemapBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) return raw;
  const fallback = getPublicSiteOrigin().replace(/\/$/, "");
  if (fallback && !/localhost|127\.0\.0\.1/i.test(fallback)) return fallback;
  return "https://joyamedicalsupplies.com.au";
}
