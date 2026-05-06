/**
 * WooCommerce coupon restriction helpers — align headless cart + checkout quotes with WC admin rules.
 */

export function parseCouponIdArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

export function categoryIdsFromCatalogProduct(p: Record<string, unknown> | undefined): number[] {
  if (!p) return [];
  const cats = p.categories;
  if (!Array.isArray(cats)) return [];
  const out: number[] = [];
  for (const c of cats) {
    if (c && typeof c === "object" && "id" in c) {
      const n = Number((c as { id: unknown }).id);
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
  }
  return out;
}

export type CouponRestrictionTuple = {
  product_ids: number[];
  excluded_product_ids: number[];
  product_categories: number[];
  excluded_product_categories: number[];
};

export function restrictionsFromWooCoupon(c: Record<string, unknown>): CouponRestrictionTuple {
  return {
    product_ids: parseCouponIdArray(c.product_ids),
    excluded_product_ids: parseCouponIdArray(c.excluded_product_ids),
    product_categories: parseCouponIdArray(c.product_categories),
    excluded_product_categories: parseCouponIdArray(c.excluded_product_categories),
  };
}

/**
 * Whether a line may receive discount under WC-style product/category rules (before exclude-sale filtering).
 */
export function cartLineEligibleForCouponDiscount(
  li: { product_id: number; variation_id?: number },
  coupon: CouponRestrictionTuple,
  lineCategoryIds: number[],
): boolean {
  const pid = li.product_id;
  const vid = li.variation_id && li.variation_id > 0 ? li.variation_id : 0;

  const { product_ids, excluded_product_ids, product_categories, excluded_product_categories } =
    coupon;

  if (excluded_product_ids.includes(pid) || (vid > 0 && excluded_product_ids.includes(vid))) {
    return false;
  }
  if (lineCategoryIds.some((cid) => excluded_product_categories.includes(cid))) {
    return false;
  }

  const hasProductInclude = product_ids.length > 0;
  const hasCategoryInclude = product_categories.length > 0;

  if (!hasProductInclude && !hasCategoryInclude) {
    return true;
  }

  let productMatch = false;
  if (hasProductInclude) {
    if (product_ids.includes(pid)) productMatch = true;
    if (vid > 0 && product_ids.includes(vid)) productMatch = true;
  }

  let categoryMatch = false;
  if (hasCategoryInclude) {
    categoryMatch = lineCategoryIds.some((cid) => product_categories.includes(cid));
  }

  if (hasProductInclude && hasCategoryInclude) {
    return productMatch || categoryMatch;
  }
  if (hasProductInclude) return productMatch;
  return categoryMatch;
}
