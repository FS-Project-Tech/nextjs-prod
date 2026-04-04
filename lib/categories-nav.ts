import { getUnifiedCategories, type UnifiedCategory } from "@/lib/categories-unified";

const NAV_PARENT_SLUGS = ["continence-care", "woundcare", "urinary-care", "skincare", "nutrition"];

export async function getCategoriesForNav() {
  const payload = await getUnifiedCategories();

  const preferredParents = NAV_PARENT_SLUGS.map((slug) =>
    payload.categories.find((cat) => cat.slug === slug)
  ).filter((cat): cat is UnifiedCategory => Boolean(cat));
  const parentCategories =
    preferredParents.length > 0
      ? preferredParents
      : payload.roots.filter((cat) => cat.count > 0).slice(0, 8);

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
