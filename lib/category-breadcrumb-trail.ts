import type { CategoryTrailItem } from "@/lib/woocommerce/types";

export type CategoryBreadcrumbSegment = { label: string; href?: string };

/**
 * Maps a Woo category trail (root → leaf) to breadcrumb segments with
 * cumulative `/product-category/parent/child` paths so nested URLs resolve correctly.
 */
export function categoryTrailToBreadcrumbSegments(
  trail: CategoryTrailItem[],
  options: { omitHrefOnLast: boolean },
): CategoryBreadcrumbSegment[] {
  if (!trail.length) return [];
  return trail.map((c, idx) => {
    const href =
      "/product-category/" +
      trail
        .slice(0, idx + 1)
        .map((t) => encodeURIComponent(t.slug))
        .join("/");
    const isLast = idx === trail.length - 1;
    if (isLast && options.omitHrefOnLast) {
      return { label: c.name };
    }
    return { label: c.name, href };
  });
}
