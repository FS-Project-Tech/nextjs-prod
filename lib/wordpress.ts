import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import { getPublicSiteOrigin } from "@/lib/cms-seo";
import {
  extractDescriptionsFromYoastHead,
  extractTitleFromYoastHead,
  isYoastHeadJsonSparse,
  mergeYoastHeadJson,
  type WpEntityWithYoast,
  type YoastHeadJsonLike,
} from "@/lib/yoast";

/** WordPress REST product (Yoast adds `yoast_head_json` when REST integration is enabled). */
export async function fetchProductSEO(slug: string) {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  const res = await fetch(
    `${base}/wp-json/wp/v2/product?slug=${encodeURIComponent(slug.trim())}`,
    { next: { revalidate: 300 } },
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data?.[0] || null;
}

export async function fetchCategorySEO(slug: string) {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  const res = await fetch(
    `${base}/wp-json/wp/v2/product_cat?slug=${encodeURIComponent(slug.trim())}`,
    { next: { revalidate: 600 } },
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data?.[0] || null;
}

/** WordPress post with Yoast REST fields (`yoast_head_json` / `yoast_head`). */
export async function fetchPostSEO(slug: string): Promise<WpEntityWithYoast | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  try {
    const res = await fetch(
      `${base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug.trim())}&_embed=1`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const post = Array.isArray(data) ? data[0] : null;
    return post && typeof post === "object" ? (post as WpEntityWithYoast) : null;
  } catch {
    return null;
  }
}

const BRAND_TAXONOMY_REST_BASES = ["product_brand", "pa_brand", "brand"] as const;

type WpTermWithYoast = WpEntityWithYoast & Record<string, unknown>;

function yoastTextRichness(term: WpTermWithYoast): number {
  const y = term.yoast_head_json;
  if (y && typeof y === "object" && y !== null) {
    const o = y as Record<string, unknown>;
    let s = 0;
    if (String(o.description || "").trim()) s += 5;
    if (String(o.og_description || "").trim()) s += 4;
    if (String(o.twitter_description || "").trim()) s += 3;
    if (String(o.title || "").trim()) s += 6;
    return s;
  }
  const head = term.yoast_head;
  if (typeof head === "string" && (head.includes("description") || head.includes("og:description"))) {
    return 2;
  }
  return 0;
}

/**
 * WordPress brand term for Yoast (`yoast_head_json` / `yoast_head`) — same taxonomies as `resolveBrandSlugToTerm`.
 * When the same slug exists on multiple taxonomies, prefers the term with actual Yoast text (avoids empty
 * `product_brand` stubs shadowing `pa_brand` with meta descriptions).
 */
export async function fetchBrandTermSEO(slug: string): Promise<WpTermWithYoast | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  const slugEnc = encodeURIComponent(slug.trim());
  const found: WpTermWithYoast[] = [];

  for (const tax of BRAND_TAXONOMY_REST_BASES) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/${tax}?slug=${slugEnc}`, {
        next: { revalidate: 600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const term = Array.isArray(data) ? data[0] : data;
      if (term && typeof term === "object" && (term as { id?: number }).id != null) {
        found.push(term as WpTermWithYoast);
      }
    } catch {
      /* try next taxonomy */
    }
  }

  if (found.length === 0) return null;
  if (found.length === 1) return found[0];

  found.sort((a, b) => yoastTextRichness(b) - yoastTextRichness(a));
  return found[0];
}

function yoastHeadJsonFromApiPayload(data: unknown): YoastHeadJsonLike | null {
  const j =
    data && typeof data === "object" && data !== null && "json" in data
      ? (data as { json?: unknown }).json
      : data;
  if (j && typeof j === "object" && j !== null) {
    return j as YoastHeadJsonLike;
  }
  return null;
}

/** Yoast `get_head` for one or more public URLs (headless + WordPress permalinks). */
export async function fetchYoastHeadJsonFromUrlCandidates(
  urlCandidates: string[],
  revalidate = 600,
): Promise<YoastHeadJsonLike | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || urlCandidates.length === 0) return null;

  const normalizedBase = base.replace(/\/$/, "");
  let best: YoastHeadJsonLike | null = null;

  for (const pageUrl of urlCandidates) {
    if (!pageUrl?.trim()) continue;
    try {
      const res = await fetch(
        `${normalizedBase}/wp-json/yoast/v1/get_head?url=${encodeURIComponent(pageUrl.trim())}`,
        { next: { revalidate } },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const j = yoastHeadJsonFromApiPayload(data);
      if (!j) continue;
      if (!isYoastHeadJsonSparse(j)) return j;
      best = mergeYoastHeadJson(best, j);
    } catch {
      continue;
    }
  }

  return best;
}

function yoastHeadFromEntityHtml(entity: WpEntityWithYoast | null | undefined): YoastHeadJsonLike {
  const fromHtml: YoastHeadJsonLike = {};
  if (typeof entity?.yoast_head === "string" && entity.yoast_head.trim()) {
    const desc = extractDescriptionsFromYoastHead(entity.yoast_head);
    const title = extractTitleFromYoastHead(entity.yoast_head);
    if (title) fromHtml.title = title;
    if (desc.meta) fromHtml.description = desc.meta;
    if (desc.og) fromHtml.og_description = desc.og;
  }
  return fromHtml;
}

/** REST entity → yoast_head HTML → Yoast `get_head` for supplied URLs. */
export async function resolveYoastHeadFromEntity(
  entity: WpEntityWithYoast | null | undefined,
  apiUrlCandidates: string[],
  revalidate = 600,
): Promise<YoastHeadJsonLike> {
  const fromJson =
    entity?.yoast_head_json && typeof entity.yoast_head_json === "object"
      ? (entity.yoast_head_json as YoastHeadJsonLike)
      : undefined;

  let merged = mergeYoastHeadJson(fromJson, yoastHeadFromEntityHtml(entity));

  if (isYoastHeadJsonSparse(merged)) {
    const fromApi = await fetchYoastHeadJsonFromUrlCandidates(apiUrlCandidates, revalidate).catch(
      () => null,
    );
    merged = mergeYoastHeadJson(merged, fromApi);
  }

  return merged;
}

/**
 * Yoast SEO REST: head JSON for a public brand archive URL (fallback when term `yoast_head_json` is sparse).
 */
export async function fetchBrandYoastHeadJsonFromYoastApi(slug: string): Promise<YoastHeadJsonLike | null> {
  if (!slug?.trim()) return null;

  const normalizedBase = getWordPressRestBaseUrl().replace(/\/$/, "");
  const slugTrim = slug.trim();
  const siteOrigin = getPublicSiteOrigin().replace(/\/$/, "");

  const urlCandidates = [
    siteOrigin ? `${siteOrigin}/brands/${slugTrim}` : null,
    siteOrigin ? `${siteOrigin}/brands/${slugTrim}/` : null,
    `${normalizedBase}/product_brand/${slugTrim}/`,
    `${normalizedBase}/brand/${slugTrim}/`,
    `${normalizedBase}/brands/${slugTrim}/`,
  ].filter((u): u is string => Boolean(u));

  return fetchYoastHeadJsonFromUrlCandidates(urlCandidates);
}

/** Yoast fields for brand archives: term REST → yoast_head HTML → Yoast get_head API. */
export async function resolveBrandYoastHead(
  slug: string,
  wpTerm: WpTermWithYoast | null,
): Promise<YoastHeadJsonLike> {
  const slugTrim = slug.trim();
  const siteOrigin = getPublicSiteOrigin().replace(/\/$/, "");
  const normalizedBase = getWordPressRestBaseUrl().replace(/\/$/, "");

  const apiUrlCandidates = [
    siteOrigin ? `${siteOrigin}/brands/${slugTrim}` : null,
    siteOrigin ? `${siteOrigin}/brands/${slugTrim}/` : null,
    `${normalizedBase}/product_brand/${slugTrim}/`,
    `${normalizedBase}/brand/${slugTrim}/`,
    `${normalizedBase}/brands/${slugTrim}/`,
  ].filter((u): u is string => Boolean(u));

  return resolveYoastHeadFromEntity(wpTerm, apiUrlCandidates);
}

/** Yoast for a single blog post: post REST → yoast_head HTML → Yoast get_head API. */
export async function resolvePostYoastHead(
  slug: string,
  post: WpEntityWithYoast | null | undefined,
): Promise<YoastHeadJsonLike> {
  const slugTrim = slug.trim();
  const siteOrigin = getPublicSiteOrigin().replace(/\/$/, "");
  const normalizedBase = getWordPressRestBaseUrl().replace(/\/$/, "");

  let entity = post;
  if (!entity?.yoast_head_json && !entity?.yoast_head) {
    entity = (await fetchPostSEO(slugTrim).catch(() => null)) ?? entity;
  }

  const apiUrlCandidates = [
    siteOrigin ? `${siteOrigin}/blog/${slugTrim}` : null,
    siteOrigin ? `${siteOrigin}/blog/${slugTrim}/` : null,
    `${normalizedBase}/${slugTrim}/`,
    `${normalizedBase}/blog/${slugTrim}/`,
  ].filter((u): u is string => Boolean(u));

  return resolveYoastHeadFromEntity(entity, apiUrlCandidates, 60);
}

/** Yoast for a WordPress page (CMS slug + headless pathname). */
export async function resolveWpPageYoastHead(
  wpSlug: string,
  pathname: string,
  page?: WpEntityWithYoast | null,
): Promise<YoastHeadJsonLike> {
  let entity = page;
  if (entity === undefined) {
    const { fetchPageBySlug } = await import("@/lib/cms-pages");
    entity = await fetchPageBySlug(wpSlug).catch(() => null);
  }

  const siteOrigin = getPublicSiteOrigin().replace(/\/$/, "");
  const normalizedBase = getWordPressRestBaseUrl().replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  const apiUrlCandidates = [
    siteOrigin ? `${siteOrigin}${path}` : null,
    siteOrigin ? `${siteOrigin}${path}/` : null,
    `${normalizedBase}${path}/`,
    `${normalizedBase}/${wpSlug}/`,
  ].filter((u): u is string => Boolean(u));

  return resolveYoastHeadFromEntity(entity, apiUrlCandidates, 600);
}

/** Yoast for `/blog` index (optional WP page + headless / blog archive URLs). */
export async function resolveBlogIndexYoastHead(
  page?: WpEntityWithYoast | null,
): Promise<YoastHeadJsonLike> {
  let entity = page;
  if (entity === undefined) {
    const { fetchPageBySlug } = await import("@/lib/cms-pages");
    entity = await fetchPageBySlug("blog").catch(() => null);
  }

  const siteOrigin = getPublicSiteOrigin().replace(/\/$/, "");
  const normalizedBase = getWordPressRestBaseUrl().replace(/\/$/, "");

  const apiUrlCandidates = [
    siteOrigin ? `${siteOrigin}/blog` : null,
    siteOrigin ? `${siteOrigin}/blog/` : null,
    `${normalizedBase}/blog/`,
  ].filter((u): u is string => Boolean(u));

  return resolveYoastHeadFromEntity(entity, apiUrlCandidates, 60);
}

/** Fetch brand by slug from WordPress (e.g. /brand/3m/ – plugin may register product_brand or similar). */
export async function fetchBrandBySlug(slug: string) {
  const base = getWordPressRestBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/wp-json/custom/v1/brands?slug=${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
    });

    const data = await res.json();

    const brand = Array.isArray(data) ? data[0] : null;

    if (!brand) return null;

    return {
      name: brand.name,
      description: brand.description || "",
      image: brand.image || null,
    };
  } catch {
    return null;
  }
}
