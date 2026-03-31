const WP_URL = process.env.NEXT_PUBLIC_WP_URL || "";
 
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
export async function fetchCategoryBanner(
  categoryId: number
): Promise<CategoryBannerData | null> {
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
 
/** Get banner image URL from ACF response (string or object) */
export function getBannerImageUrl(banner: DetailBannerData | CategoryBannerRow | null): string | null {
  if (!banner?.banner_image) return null;
  return typeof banner.banner_image === "string"
    ? banner.banner_image
    : banner.banner_image?.url || null;
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
    if (banners.some((row) => getBannerImageUrl(row))) {
      return banners;
    }
    const parentId = data?.parent;
    currentId = parentId && parentId > 0 ? parentId : null;
  }
  return [];
}