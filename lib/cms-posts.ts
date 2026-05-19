/**
 * Fetch WordPress blog posts for the headless blog page
 */

import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import type { WpEntityWithYoast } from "@/lib/yoast";

function wpPostsBaseUrl(): string {
  return getWordPressRestBaseUrl();
}

export interface WpPost extends WpEntityWithYoast {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  modified: string;
  featured_media: number;
  categories: number[];
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; alt_text?: string }>;
    "wp:term"?: Array<Array<{ id: number; name: string; slug: string }>>;
  };
}

/** Slugs to exclude from blog (funding scheme posts live at /funding-scheme) */
export const BLOG_EXCLUDE_SLUGS = ["funding-schemes", "caps", "my-aged-care", "ndis"];

/** Strip tags from a WP `rendered` field for fallbacks when Yoast is empty. */
export function plainTextFromRendered(html: string | undefined, maxLength?: number): string {
  const text = (html || "").replace(/<[^>]+>/g, "").trim();
  if (maxLength != null && maxLength > 0) return text.slice(0, maxLength);
  return text;
}

export async function fetchPosts(params?: {
  per?: number;
  page?: number;
  categories?: number[];
  excludeSlugs?: string[];
}): Promise<{ posts: WpPost[]; totalPages: number }> {
  const base = wpPostsBaseUrl();
  if (!base) return { posts: [], totalPages: 0 };
  try {
    const per = params?.per ?? 10;
    const excludeSlugs = params?.excludeSlugs ?? BLOG_EXCLUDE_SLUGS;
    const search = new URLSearchParams();
    search.set("per_page", String(excludeSlugs.length > 0 ? per + 10 : per));
    search.set("page", String(params?.page ?? 1));
    search.set("_embed", "1");
    if (params?.categories?.length) {
      search.set("categories", params.categories.join(","));
    }
    const res = await fetch(`${base}/wp-json/wp/v2/posts?${search}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { posts: [], totalPages: 0 };
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return { posts: [], totalPages: 0 };
    let posts: WpPost[] = json as WpPost[];
    if (excludeSlugs.length > 0) {
      posts = posts.filter((p) => p && typeof p.slug === "string" && !excludeSlugs.includes(p.slug)).slice(0, per);
    }
    const rawTotal = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10);
    const totalPages = Math.min(200, Math.max(1, Number.isFinite(rawTotal) ? rawTotal : 1));
    return { posts, totalPages };
  } catch {
    return { posts: [], totalPages: 0 };
  }
}

export async function fetchPostBySlug(slug: string): Promise<WpPost | null> {
  const base = wpPostsBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    return (data[0] as WpPost | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function fetchCategories(): Promise<{ id: number; name: string; slug: string }[]> {
  const base = wpPostsBaseUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/categories?per_page=50`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((c: { id: number; name: string; slug: string }) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    }));
  } catch {
    return [];
  }
}

const BLOG_SITEMAP_PER_PAGE = 100;

function blogSitemapMaxPages(requested?: number): number {
  const fromEnv = Number.parseInt(process.env.SITEMAP_MAX_BLOG_PAGES || "", 10);
  const defaultCap = 50;
  const base =
    typeof requested === "number" && requested > 0
      ? requested
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : defaultCap;
  return Math.min(Math.max(base, 1), 200);
}

/**
 * All published blog posts for `/sitemap.xml` (URLs match `/blog/[slug]`).
 * Respects {@link BLOG_EXCLUDE_SLUGS} like the blog index.
 */
export async function fetchAllPostsForSitemap(options?: {
  maxPages?: number;
}): Promise<WpPost[]> {
  const base = wpPostsBaseUrl().replace(/\/$/, "");
  if (!base) return [];

  const exclude = new Set(BLOG_EXCLUDE_SLUGS);
  const maxPages = blogSitemapMaxPages(options?.maxPages);

  const buildUrl = (page: number) => {
    const u = new URL(`${base}/wp-json/wp/v2/posts`);
    u.searchParams.set("per_page", String(BLOG_SITEMAP_PER_PAGE));
    u.searchParams.set("page", String(page));
    u.searchParams.set("status", "publish");
    return u.toString();
  };

  try {
    const firstRes = await fetch(buildUrl(1), { next: { revalidate: 3600 } });
    if (!firstRes.ok) return [];
    const firstJson: unknown = await firstRes.json();
    if (!Array.isArray(firstJson)) return [];

    const all: WpPost[] = [];
    const pushFiltered = (rows: unknown[]) => {
      for (const row of rows) {
        const p = row as WpPost;
        if (p && typeof p.slug === "string" && p.slug && !exclude.has(p.slug)) {
          all.push(p);
        }
      }
    };
    pushFiltered(firstJson);

    const totalPagesRaw = parseInt(firstRes.headers.get("x-wp-totalpages") || "1", 10);
    const totalPages = Math.min(Math.max(1, Number.isFinite(totalPagesRaw) ? totalPagesRaw : 1), maxPages);

    for (let page = 2; page <= totalPages; page++) {
      const res = await fetch(buildUrl(page), { next: { revalidate: 3600 } }).catch(() => null);
      if (!res?.ok) break;
      const json: unknown = await res.json();
      if (!Array.isArray(json) || json.length === 0) break;
      pushFiltered(json);
    }

    return all;
  } catch {
    return [];
  }
}
