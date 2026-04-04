/**
 * Slug-based routing for /our-nursing-services/[slug].
 * WordPress page slug is the source of truth — add pages in WP; no hardcoded title map.
 * Optional env lists extra slugs for static generation + hub HTML link rewriting.
 */

import { getWordPressRestBaseUrl } from "@/lib/cms-pages";

/** Comma- or space-separated slugs (e.g. top-level WP pages linked from hub HTML). */
export function parseNursingDetailExtraSlugsFromEnv(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_NURSING_DETAIL_SLUGS || process.env.NURSING_DETAIL_SLUGS || "";
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9][-a-z0-9]*$/i.test(s));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite WordPress absolute links to Next nursing detail routes.
 * Only hrefs whose path segment matches a slug in `allowedSlugs` are changed.
 */
export function rewriteNursingHubLinksToNext(
  html: string,
  allowedSlugs: Iterable<string>,
  wpBaseUrl: string = getWordPressRestBaseUrl()
): string {
  const base = wpBaseUrl.replace(/\/$/, "");
  if (!base || !html) return html;

  const slugSet = new Set([...allowedSlugs].map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (slugSet.size === 0) return html;

  const eb = escapeRegExp(base);
  let out = html;

  for (const slug of slugSet) {
    if (!/^[a-z0-9][-a-z0-9]*$/i.test(slug)) continue;
    const es = escapeRegExp(slug);
    // Full WordPress URL → Next detail route
    const reAbs = new RegExp(`(href=)(["'])${eb}/${es}(/?)\\2`, "gi");
    out = out.replace(reAbs, `$1$2/our-nursing-services/${slug}$2`);
    // Root-relative (common in WP: /wound-management/) — on Next that would 404 without prefix
    const reRel = new RegExp(`(href=)(["'])/${es}(/?)\\2`, "gi");
    out = out.replace(reRel, `$1$2/our-nursing-services/${slug}$2`);
  }

  return out;
}
