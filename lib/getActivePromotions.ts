// lib/getActivePromotions.ts
export function getActivePromotions(promotions: any[], productCategoryIds: number[]) {
  const matched = promotions.filter((promo) =>
    promo.categories?.some((cat: any) => productCategoryIds.includes(cat.term_id))
  );

  // Category-specific promos first
  if (matched.length > 0) return matched;

  // Fallback to GENERAL (no category assigned)
  return promotions.filter((promo) => !promo.categories || promo.categories.length === 0);
}
