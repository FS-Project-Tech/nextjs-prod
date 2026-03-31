/**
 * Fetch WordPress pages by slug for info/theory pages (privacy, terms, faq, shipping, etc.)
 */

import { getWpBaseUrl } from "@/lib/wp-utils";

/** Base URL for wp-json (no trailing slash). Tries env vars + WC_API_URL-derived host. */
export function getWordPressRestBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_WP_URL,
    process.env.WORDPRESS_URL,
    process.env.WP_URL,
  ];
  for (const c of candidates) {
    const t = (c || "").trim().replace(/\/$/, "");
    if (t) return t;
  }
  const wcPublic = (process.env.NEXT_PUBLIC_WC_API_URL || "").trim();
  if (wcPublic) {
    try {
      const u = new URL(wcPublic);
      return `${u.protocol}//${u.host}`.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
  }
  const fromWc = getWpBaseUrl().trim().replace(/\/$/, "");
  return fromWc;
}
 
export interface WpPage {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  modified: string;
  featured_media?: number;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; alt_text?: string }>;
  };
}

export async function fetchPageBySlug(slug: string): Promise<WpPage | null> {
  const base = getWordPressRestBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_embed=1`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data[0] ?? null : data;
  } catch {
    return null;
  }
}

/**
 * Child pages of a parent page (WordPress **Parent** dropdown).
 * Use for /our-nursing-services cards: set each service page’s parent to “Our Nursing Services”.
 */
export async function fetchChildPages(parentId: number): Promise<WpPage[]> {
  const base = getWordPressRestBaseUrl();
  if (!base || !parentId) return [];
  try {
    const params = new URLSearchParams({
      parent: String(parentId),
      per_page: "100",
      orderby: "menu_order",
      order: "asc",
      _embed: "1",
    });
    const res = await fetch(
      `${base}/wp-json/wp/v2/pages?${params.toString()}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
