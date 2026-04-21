import { unstable_cache } from "next/cache";
import {
  getUnifiedCategories,
  getRootCategoriesNonEmpty,
  type UnifiedCategory,
} from "@/lib/categories-unified";
import { CACHE_TAGS } from "@/lib/cache";

const NAV_PARENT_SLUGS = ["continence-care", "woundcare", "urinary-care", "skincare", "nutrition"];

async function getCategoriesForNavUncached(): Promise<{
  parentCategories: UnifiedCategory[];
  childCategories: UnifiedCategory[];
}> {
  const payload = await getUnifiedCategories();

  const preferredParents = NAV_PARENT_SLUGS.map((slug) =>
    payload.categories.find((cat) => cat.slug === slug)
  ).filter((cat): cat is UnifiedCategory => Boolean(cat));
  const parentCategories =
    preferredParents.length > 0
      ? preferredParents
      : getRootCategoriesNonEmpty(payload).slice(0, 8);

  const parentIds = parentCategories.map((cat) => cat.id);

  function getAllDescendants(categories: UnifiedCategory[], rootIds: number[]): UnifiedCategory[] {
    const result: UnifiedCategory[] = [];

    function findChildren(pids: number[]) {
      const children = categories.filter((cat) => pids.includes(cat.parent));
      if (!children.length) return;
      result.push(...children);
      findChildren(children.map((c) => c.id));
    }

    findChildren(rootIds);
    return result;
  }

  const childCategories = getAllDescendants(payload.categories, parentIds);

  return {
    parentCategories,
    childCategories,
  };
}

const getCategoriesForNavCached = unstable_cache(getCategoriesForNavUncached, ["categories-for-nav-v2"], {
  revalidate: 300,
  tags: [CACHE_TAGS.CATEGORIES],
});

/**
 * Nav tree for `CategoriesNav`. Cached across requests via Next.js Data Cache (survives serverless cold starts).
 */
export async function getCategoriesForNav() {
  return getCategoriesForNavCached();
}
