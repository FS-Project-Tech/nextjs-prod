import { fetchCategories, type WooCommerceCategory } from "@/lib/woocommerce";
import { cached, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";

/** WooCommerce fetch is full tree; {@link filterCategoryTreeWithProducts} strips empty branches. */
const UNIFIED_CACHE_KEY = "categories:unified:v2";

export interface UnifiedCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
  description?: string;
  image?: { src: string; alt?: string } | null;
}

export interface UnifiedCategoriesPayload {
  /** Full flat list (every level). */
  categories: UnifiedCategory[];
  /** Top-level only (`parent === 0`). */
  roots: UnifiedCategory[];
  /** Direct children keyed by parent id (string keys for JSON). */
  childrenByParentId: Record<string, UnifiedCategory[]>;
}

function normalizeCategory(
  raw: WooCommerceCategory & { image?: { src?: string; alt?: string } }
): UnifiedCategory {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    parent: typeof raw.parent === "number" ? raw.parent : Number(raw.parent) || 0,
    count: raw.count ?? 0,
    description: raw.description,
    image: raw.image?.src ? { src: raw.image.src, alt: raw.image.alt } : null,
  };
}

function byName(a: UnifiedCategory, b: UnifiedCategory) {
  return a.name.localeCompare(b.name);
}

/**
 * Drop categories with no products, but keep ancestor folders so navigation still works.
 */
function filterCategoryTreeWithProducts(flat: WooCommerceCategory[]): WooCommerceCategory[] {
  const byId = new Map(flat.map((c) => [c.id, c]));
  const withProducts = flat.filter((c) => (c.count ?? 0) > 0);
  const keepIds = new Set<number>();

  for (const cat of withProducts) {
    keepIds.add(cat.id);
    let pid =
      typeof cat.parent === "number" ? cat.parent : Number(cat.parent) || 0;
    while (pid > 0) {
      keepIds.add(pid);
      const p = byId.get(pid);
      if (!p) break;
      pid =
        typeof p.parent === "number" ? p.parent : Number(p.parent) || 0;
    }
  }

  return flat.filter((c) => keepIds.has(c.id));
}

export function buildUnifiedCategoriesPayload(
  flat: WooCommerceCategory[]
): UnifiedCategoriesPayload {
  const pruned = filterCategoryTreeWithProducts(flat);
  const categories = pruned.map((c) =>
    normalizeCategory(c as WooCommerceCategory & { image?: { src?: string; alt?: string } })
  );

  const roots = categories.filter((c) => !c.parent || c.parent === 0).sort(byName);

  const childrenByParentId: Record<string, UnifiedCategory[]> = {};
  for (const cat of categories) {
    const p = cat.parent;
    if (!p || p <= 0) continue;
    const key = String(p);
    if (!childrenByParentId[key]) childrenByParentId[key] = [];
    childrenByParentId[key].push(cat);
  }
  for (const k of Object.keys(childrenByParentId)) {
    childrenByParentId[k].sort(byName);
  }

  return { categories, roots, childrenByParentId };
}

/**
 * Single WooCommerce-backed category load for the whole app (memory cache + tags).
 */
export async function getUnifiedCategories(
  options: {
    skipCache?: boolean;
  } = {}
): Promise<UnifiedCategoriesPayload> {
  return cached(
    UNIFIED_CACHE_KEY,
    async () => {
      const flat = await fetchCategories({ hide_empty: false });
      return buildUnifiedCategoriesPayload(flat);
    },
    {
      ttl: CACHE_TTL.CATEGORIES,
      tags: [CACHE_TAGS.CATEGORIES],
      skipCache: options.skipCache,
    }
  );
}

export function getChildrenForParent(
  payload: UnifiedCategoriesPayload,
  parentId: number,
  options: { hideEmpty?: boolean } = { hideEmpty: true }
): UnifiedCategory[] {
  const list = payload.childrenByParentId[String(parentId)] || [];
  if (options.hideEmpty === false) return list;
  /** IDs that have at least one child in the pruned tree (folder nodes may have count 0). */
  const parentIdsInTree = new Set(
    payload.categories
      .filter((c) => c.parent && c.parent > 0)
      .map((c) => c.parent)
  );
  return list.filter((c) => c.count > 0 || parentIdsInTree.has(c.id));
}

export function getRootCategoriesNonEmpty(payload: UnifiedCategoriesPayload): UnifiedCategory[] {
  const parentIdsInTree = new Set(
    payload.categories
      .filter((c) => c.parent && c.parent > 0)
      .map((c) => c.parent)
  );
  return payload.roots.filter((r) => r.count > 0 || parentIdsInTree.has(r.id));
}

export function findCategoryBySlug(
  payload: UnifiedCategoriesPayload,
  slug: string
): UnifiedCategory | undefined {
  const s = slug.trim().toLowerCase();
  return payload.categories.find((c) => c.slug.toLowerCase() === s);
}
