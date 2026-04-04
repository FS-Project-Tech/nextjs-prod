/**
 * Fetch WordPress pages by slug for info/theory pages (privacy, terms, faq, shipping, etc.)
 */

import { getWpBaseUrl } from "@/lib/wp-utils";

/**
 * Base URL for wp-json (no trailing slash).
 *
 * If you browse the site on `stage.example.com` but `NEXT_PUBLIC_WP_URL` points at a
 * Cloudways hostname, **pages you create on staging may not exist on that host** (or vice versa).
 * Set `NEXT_PUBLIC_WORDPRESS_REST_URL` (or server-only `WORDPRESS_REST_BASE_URL`) to the exact
 * domain where the REST API should run (e.g. your staging URL).
 */
export function getWordPressRestBaseUrl(): string {
  const candidates = [
    process.env.WORDPRESS_REST_BASE_URL,
    process.env.NEXT_PUBLIC_WORDPRESS_REST_URL,
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

function buildFetchInit(init?: { revalidate?: number; cache?: RequestCache }) {
  const fetchInit: RequestInit & { next?: { revalidate: number } } =
    init?.cache === "no-store"
      ? { cache: "no-store" }
      : { next: { revalidate: init?.revalidate ?? 3600 } };
  return fetchInit;
}

export async function fetchPageBySlug(
  slug: string,
  init?: { revalidate?: number; cache?: RequestCache }
): Promise<WpPage | null> {
  const base = getWordPressRestBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_embed=1`,
      buildFetchInit(init)
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

/**
 * Any wp/v2 collection that exposes slug + content like pages (pages, posts, CPT rest base).
 */
export async function fetchWpCollectionBySlug(
  collection: string,
  slug: string,
  init?: { revalidate?: number; cache?: RequestCache }
): Promise<WpPage | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || !collection || !slug) return null;
  const safeCollection = collection.replace(/^\/+|\/+$/g, "").replace(/\//g, "");
  if (!safeCollection) return null;
  try {
    const res = await fetch(
      `${base}/wp-json/wp/v2/${safeCollection}?slug=${encodeURIComponent(slug)}&_embed=1`,
      buildFetchInit(init)
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? (data[0] ?? null) : data;
    if (!item || typeof item !== "object" || !(item as { id?: number }).id) {
      return null;
    }
    return item as WpPage;
  } catch {
    return null;
  }
}

/** Find a published page whose slug matches exactly (helps when ?slug= is flaky with some plugins). */
export async function fetchPageBySlugSearch(
  exactSlug: string,
  init?: { revalidate?: number; cache?: RequestCache }
): Promise<WpPage | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || !exactSlug) return null;
  try {
    const params = new URLSearchParams({
      search: exactSlug,
      per_page: "50",
      _embed: "1",
    });
    const res = await fetch(
      `${base}/wp-json/wp/v2/pages?${params.toString()}`,
      buildFetchInit(init)
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    const hit = data.find(
      (p: { slug?: string }) => String(p.slug || "").toLowerCase() === exactSlug.toLowerCase()
    );
    return hit ? (hit as WpPage) : null;
  } catch {
    return null;
  }
}

/**
 * Try several slugs; for each slug try pages, posts, optional CPT (env), then page search.
 * Use for headless routes when content might be a Post or REST slug lookup is unreliable.
 *
 * Env (optional):
 * - NEXT_PUBLIC_WP_HEALTH_PROFESSIONALS_POST_TYPE = CPT REST base (e.g. resource), not slug
 */
export async function fetchFirstPageOrPostBySlug(
  slugs: string[],
  init?: { revalidate?: number; cache?: RequestCache },
  options?: { extraRestCollections?: string[] }
): Promise<WpPage | null> {
  const envCpt = process.env.NEXT_PUBLIC_WP_HEALTH_PROFESSIONALS_POST_TYPE?.trim();
  const collections = [
    ...new Set([
      "pages",
      "posts",
      ...(options?.extraRestCollections || []).map((s) => s.replace(/^\/+|\/+$/g, "")),
      ...(envCpt ? [envCpt.replace(/^\/+|\/+$/g, "")] : []),
    ]),
  ].filter(Boolean);
  const seenSlug = new Set<string>();

  for (const raw of slugs) {
    const slug = raw?.trim();
    if (!slug || seenSlug.has(slug)) continue;
    seenSlug.add(slug);

    for (const col of collections) {
      const row = await fetchWpCollectionBySlug(col, slug, init);
      if (row) return row;
    }

    const fromSearch = await fetchPageBySlugSearch(slug, init);
    if (fromSearch) return fromSearch;
  }
  return null;
}

/** Try several slugs (common when WP slug differs slightly). Uses no-store to avoid caching empty results. */
export async function fetchFirstPageBySlug(
  slugs: string[],
  init?: { revalidate?: number; cache?: RequestCache }
): Promise<WpPage | null> {
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = raw?.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const page = await fetchPageBySlug(slug, init);
    if (page) return page;
  }
  return null;
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
    const res = await fetch(`${base}/wp-json/wp/v2/pages?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
