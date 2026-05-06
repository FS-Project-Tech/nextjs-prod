import "server-only";

import { decodeHTMLEntities } from "@/lib/xss-sanitizer";
import type { CategoryTrailItem } from "./types";
import { wcGet } from "./wc-fetch";

const MAX_DEPTH = 32;

/**
 * Walks Woo `parent` links from a leaf category id to the root (parent 0).
 * Order is **root → … → leaf**, suitable for breadcrumbs.
 */
export async function fetchCategoryTrailFromLeaf(leafId: number): Promise<CategoryTrailItem[]> {
  const idNum = Number(leafId);
  if (!Number.isFinite(idNum) || idNum <= 0) return [];

  const trail: CategoryTrailItem[] = [];
  let currentId: number | null = idNum;
  const seen = new Set<number>();

  for (let depth = 0; depth < MAX_DEPTH && currentId != null && currentId > 0; depth++) {
    if (seen.has(currentId)) break;
    seen.add(currentId);

    try {
      const { data } = await wcGet<{
        id: number;
        name: string;
        slug: string;
        parent?: number;
      }>(`/products/categories/${currentId}`, undefined, "categories");

      if (!data || typeof data.id !== "number") break;

      trail.unshift({
        id: data.id,
        name: decodeHTMLEntities(String(data.name ?? "")),
        slug: String(data.slug ?? "").trim(),
      });

      const parent = Number(data.parent ?? 0);
      currentId = parent > 0 ? parent : null;
    } catch {
      break;
    }
  }

  return trail;
}
