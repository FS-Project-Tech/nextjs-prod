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

/**
 * WordPress brand term for Yoast (`yoast_head_json`) — same taxonomies as `resolveBrandSlugToTerm`.
 */
export async function fetchBrandTermSEO(slug: string) {
  const base = getWordPressRestBaseUrl();
  if (!base || !slug?.trim()) return null;

  const slugEnc = encodeURIComponent(slug.trim());
  for (const tax of BRAND_TAXONOMY_REST_BASES) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/${tax}?slug=${slugEnc}`, {
        next: { revalidate: 600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const term = Array.isArray(data) ? data[0] : data;
      if (term && typeof term === "object" && (term as { id?: number }).id != null) {
        return term as Record<string, unknown> & { yoast_head_json?: unknown };
      }
    } catch {
      /* try next taxonomy */
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
