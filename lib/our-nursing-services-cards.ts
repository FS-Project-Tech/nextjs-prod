import { fetchPageBySlug, fetchChildPages, type WpPage } from "@/lib/cms-pages";
import { decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { parseNursingDetailExtraSlugsFromEnv } from "@/lib/nursing-service-routes";

export type NursingServiceItem = {
  slug: string;
  title: string;
  description: string;
  image: string;
};

/**
 * Load nursing service page by URL slug. WordPress `slug` is the source of truth
 * (add new service pages in WP — no hardcoded title → slug map).
 */
export async function fetchNursingServicePageForUrl(urlSlug: string): Promise<WpPage | null> {
  return fetchPageBySlug(urlSlug);
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return decodeHTMLEntities(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function firstImageFromContent(html: string | undefined): string {
  if (!html) return "";
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1]?.trim() || "";
}

function wpPageToCardItem(page: WpPage): NursingServiceItem {
  const title = decodeHTMLEntities(
    page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || page.slug
  );
  let description = stripHtml(page.excerpt?.rendered);
  if (!description && page.content?.rendered) {
    const full = stripHtml(page.content.rendered);
    description = full.slice(0, 280);
    if (full.length > 280) description += "…";
  }
  let image = page._embedded?.["wp:featuredmedia"]?.[0]?.source_url?.trim() || "";
  if (!image) {
    image = firstImageFromContent(page.content?.rendered);
  }

  return {
    slug: page.slug,
    title,
    description: description || title,
    image,
  };
}

/**
 * Cards for /our-nursing-services — WordPress **child pages** of slug `our-nursing-services`.
 * Each card’s `slug` is the WP page slug → `/our-nursing-services/{slug}`.
 */
export async function getOurNursingServicesCards(): Promise<NursingServiceItem[]> {
  const parent = await fetchPageBySlug("our-nursing-services");
  if (!parent?.id) return [];

  const children = await fetchChildPages(parent.id);
  return children.map(wpPageToCardItem);
}

/**
 * All slugs that should resolve under `/our-nursing-services/[slug]`:
 * - child pages of the hub (cards), plus
 * - optional `NEXT_PUBLIC_NURSING_DETAIL_SLUGS` (comma-separated) for top-level WP
 *   pages linked from hub HTML (e.g. wound-management, stoma-care).
 */
export async function getOurNursingServiceDetailSlugs(): Promise<string[]> {
  const cards = await getOurNursingServicesCards();
  const fromCards = cards.map((c) => c.slug);
  const extra = parseNursingDetailExtraSlugsFromEnv();
  return [...new Set([...fromCards, ...extra])];
}
