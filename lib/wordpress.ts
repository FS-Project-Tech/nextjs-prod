import { getWordPressRestBaseUrl } from "@/lib/cms-pages";

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

const BRAND_TAXONOMY_REST_BASES = ["product_brand", "pa_brand", "brand"] as const;

type WpTermWithYoast = Record<string, unknown> & {
  yoast_head_json?: unknown;
  yoast_head?: unknown;
};

function yoastTextRichness(term: WpTermWithYoast): number {
  const y = term.yoast_head_json;
  if (y && typeof y === "object" && y !== null) {
    const o = y as Record<string, unknown>;
    let s = 0;
    if (String(o.description || "").trim()) s += 5;
    if (String(o.og_description || "").trim()) s += 4;
    if (String(o.twitter_description || "").trim()) s += 3;
    if (String(o.title || "").trim()) s += 1;
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

/**
 * Yoast SEO REST: head JSON for a public archive URL (fallback when term `yoast_head_json` is sparse).
 */
export async function fetchBrandYoastHeadJsonFromYoastApi(slug: string): Promise<Record<string, unknown> | null> {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  const normalizedBase = base.replace(/\/$/, "");
  const urlCandidates = [
    `${normalizedBase}/product_brand/${slug.trim()}/`,
    `${normalizedBase}/brand/${slug.trim()}/`,
  ];

  for (const pageUrl of urlCandidates) {
    try {
      const res = await fetch(
        `${normalizedBase}/wp-json/yoast/v1/get_head?url=${encodeURIComponent(pageUrl)}`,
        { next: { revalidate: 600 } },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { json?: unknown };
      const j = data?.json;
      if (j && typeof j === "object" && j !== null) {
        return j as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
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
