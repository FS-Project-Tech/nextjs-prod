export function applySortBy(products: unknown[], sortBy: string): unknown[] {
  const sorted = [...products];
  switch (sortBy) {
    case "price_low":
      return sorted.sort(
        (a, b) =>
          parseFloat((a as { price?: string }).price || "0") -
          parseFloat((b as { price?: string }).price || "0")
      );
    case "price_high":
      return sorted.sort(
        (a, b) =>
          parseFloat((b as { price?: string }).price || "0") -
          parseFloat((a as { price?: string }).price || "0")
      );
    case "newest":
      return sorted.sort(
        (a, b) =>
          new Date(
            (b as { date_created?: string; date_created_gmt?: string }).date_created ||
              (b as { date_created_gmt?: string }).date_created_gmt ||
              0
          ).getTime() -
          new Date(
            (a as { date_created?: string; date_created_gmt?: string }).date_created ||
              (a as { date_created_gmt?: string }).date_created_gmt ||
              0
          ).getTime()
      );
    case "rating":
      return sorted.sort(
        (a, b) =>
          parseFloat((b as { average_rating?: string }).average_rating || "0") -
          parseFloat((a as { average_rating?: string }).average_rating || "0")
      );
    case "popularity":
      return sorted.sort(
        (a, b) =>
          ((b as { rating_count?: number }).rating_count || 0) -
          ((a as { rating_count?: number }).rating_count || 0)
      );
    default:
      return sorted;
  }
}
