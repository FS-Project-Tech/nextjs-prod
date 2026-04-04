/**
 * Fetch WordPress blog posts for the headless blog page
 */

const WP_URL = process.env.NEXT_PUBLIC_WP_URL || "";

export interface WpPost {
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

export async function fetchPosts(params?: {
  per?: number;
  page?: number;
  categories?: number[];
  excludeSlugs?: string[];
}): Promise<{ posts: WpPost[]; totalPages: number }> {
  if (!WP_URL) return { posts: [], totalPages: 0 };
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
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?${search}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { posts: [], totalPages: 0 };
    let posts: WpPost[] = await res.json();
    if (excludeSlugs.length > 0) {
      posts = posts.filter((p) => !excludeSlugs.includes(p.slug)).slice(0, per);
    }
    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10) || 1;
    return { posts, totalPages };
  } catch {
    return { posts: [], totalPages: 0 };
  }
}

export async function fetchPostBySlug(slug: string): Promise<WpPost | null> {
  if (!WP_URL) return null;
  try {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

export async function fetchCategories(): Promise<{ id: number; name: string; slug: string }[]> {
  if (!WP_URL) return [];
  try {
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/categories?per_page=50`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: { id: number; name: string; slug: string }) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    }));
  } catch {
    return [];
  }
}
