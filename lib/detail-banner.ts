const WP_URL = process.env.NEXT_PUBLIC_WP_URL || "";

async function fetchMediaSourceUrl(id: number, wpBase: string): Promise<string | null> {
  const base = (wpBase || "").trim().replace(/\/$/, "");
  if (!base || !Number.isFinite(id) || id <= 0) return null;
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/media/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      source_url?: string;
      guid?: { rendered?: string };
    };
    return data.source_url || data.guid?.rendered || null;
  } catch {
    return null;
  }
}

/** When ACF returns attachment ID (number / numeric string / { ID: n }) instead of a URL */
export function extractMediaIdFromAcfImage(bi: unknown): number | null {
  if (bi == null) return null;
  if (typeof bi === "number" && Number.isFinite(bi) && bi > 0) {
    return Math.floor(bi);
  }
  if (typeof bi === "string") {
    const t = bi.trim();
    if (/^\d+$/.test(t)) return Number(t);
    return null;
  }
  if (typeof bi === "object" && bi !== null) {
    const o = bi as Record<string, unknown>;
    const idVal = o.ID ?? o.id;
    if (typeof idVal === "number" && Number.isFinite(idVal) && idVal > 0) {
      return Math.floor(idVal);
    }
    if (typeof idVal === "string" && /^\d+$/.test(idVal.trim())) {
      return Number(idVal.trim());
    }
    const urlVal = o.url;
    if (typeof urlVal === "string" && /^\d+$/.test(urlVal.trim())) {
      return Number(urlVal.trim());
    }
    if (typeof urlVal === "number" && Number.isFinite(urlVal) && urlVal > 0) {
      return Math.floor(urlVal);
    }
  }
  return null;
}

export interface DetailBannerData {
  /** ACF returns either string URL or object with url */
  banner_image?: string | { url: string; alt?: string };
  banner_link?: string | { url: string; title?: string };
}

/** One row from the category_banners repeater */
export interface CategoryBannerRow {
  banner_image?: string | { url: string; alt?: string };
  banner_link?: string | { url: string; title?: string };
}

/** ACF response from product_cat taxonomy */
export interface CategoryBannerData {
  acf?: {
    category_banners?: CategoryBannerRow[];
  };
  parent?: number;
}

export async function fetchDetailBanner(): Promise<DetailBannerData | null> {
  if (!WP_URL) return null;
  try {
    const res = await fetch(`${WP_URL}/wp-json/acf/v3/options/detail-banner`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.acf || null;
  } catch {
    return null;
  }
}

/** Fetch category ACF (repeater category_banners) from product_cat taxonomy */
export async function fetchCategoryBanner(categoryId: number): Promise<CategoryBannerData | null> {
  if (!WP_URL || !categoryId) return null;
  try {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/product_cat/${categoryId}?_fields=acf,parent`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data ? { acf: data.acf, parent: data.parent } : null;
  } catch {
    return null;
  }
}

/** Get banner image URL from ACF when it is already a URL (not an attachment ID). */
export function getBannerImageUrl(
  banner: DetailBannerData | CategoryBannerRow | null
): string | null {
  if (!banner?.banner_image) return null;
  const bi = banner.banner_image;
  if (typeof bi === "string") {
    const t = bi.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) return null;
    return t;
  }
  if (typeof bi === "number") return null;
  if (typeof bi === "object" && bi !== null) {
    const url = (bi as { url?: unknown }).url;
    if (typeof url === "string") {
      const u = url.trim();
      if (!u) return null;
      if (/^\d+$/.test(u)) return null;
      return url;
    }
  }
  return null;
}

/** Row has a banner image we can show (direct URL or resolvable media ID). */
export function bannerRowHasImage(
  row: CategoryBannerRow | DetailBannerData | null | undefined
): boolean {
  if (!row?.banner_image) return false;
  if (getBannerImageUrl(row)) return true;
  return extractMediaIdFromAcfImage(row.banner_image) !== null;
}

/** Resolve ACF banner_image to a full URL (handles attachment IDs via REST). */
export async function resolveBannerRowImageUrl(
  row: CategoryBannerRow | DetailBannerData,
  wpBase: string
): Promise<string | null> {
  const direct = getBannerImageUrl(row);
  if (direct) return direct;
  const id = extractMediaIdFromAcfImage(row.banner_image);
  if (id != null) return fetchMediaSourceUrl(id, wpBase);
  return null;
}

/** Promotional ACF block: image may be ID, string ID, or { url }. */
export async function resolvePromoImageUrl(
  promo: { image?: unknown } | null | undefined,
  wpBase: string
): Promise<string | null> {
  const img = promo?.image;
  if (img == null) return null;
  if (typeof img === "string") {
    const t = img.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) return fetchMediaSourceUrl(Number(t), wpBase);
    if (t.startsWith("http") || t.startsWith("/")) return t;
    return null;
  }
  if (typeof img === "number") return fetchMediaSourceUrl(img, wpBase);
  if (typeof img === "object" && img !== null) {
    const o = img as Record<string, unknown>;
    const u = o.url;
    if (typeof u === "string") {
      const s = u.trim();
      if (/^\d+$/.test(s)) return fetchMediaSourceUrl(Number(s), wpBase);
      if (s.startsWith("http") || s.startsWith("/")) return u;
    }
    if (typeof u === "number") return fetchMediaSourceUrl(u, wpBase);
    const id = extractMediaIdFromAcfImage(img);
    if (id != null) return fetchMediaSourceUrl(id, wpBase);
  }
  return null;
}

/** Get banner link URL from ACF response (string or object) */
export function getBannerLinkUrl(banner: DetailBannerData | CategoryBannerRow | null): string {
  if (!banner?.banner_link) return "#";
  return typeof banner.banner_link === "string"
    ? banner.banner_link
    : banner.banner_link?.url || "#";
}

/**
 * Fetch category banners with parent inheritance.
 * If the category has no banners, walks up to parent and uses its banners.
 */
export async function fetchCategoryBannersWithInheritance(
  categoryId: number
): Promise<CategoryBannerRow[]> {
  let currentId: number | null = categoryId;
  while (currentId) {
    const data = await fetchCategoryBanner(currentId);
    const rawBanners = data?.acf?.category_banners;
    const banners = Array.isArray(rawBanners) ? rawBanners : [];
    if (banners.some((row) => bannerRowHasImage(row))) {
      return banners;
    }
    const parentId = data?.parent;
    currentId = parentId && parentId > 0 ? parentId : null;
  }
  return [];
}
