/** Public site origin for canonical / Open Graph (avoids localhost in production metadata). */
export function getPublicSiteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) return raw;
  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return raw || "";
}
