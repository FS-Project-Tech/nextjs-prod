import "server-only";

import { wcGet } from "./wc-fetch";

export type WooCommerceProductTag = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
};

function normalizeTagSlug(slug: string): string {
  return String(slug || "").trim();
}

export async function fetchProductTagBySlug(
  slug: string
): Promise<WooCommerceProductTag | null> {
  const normalized = normalizeTagSlug(slug);
  if (!normalized) return null;

  const { data } = await wcGet<WooCommerceProductTag[]>(
    "/products/tags",
    { slug: normalized, per_page: 1 },
    "categories"
  );

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export async function fetchProductTagsForSitemap(
  perPage = 100
): Promise<WooCommerceProductTag[]> {
  const { data } = await wcGet<WooCommerceProductTag[]>(
    "/products/tags",
    {
      per_page: perPage,
      orderby: "count",
      order: "desc",
      hide_empty: true,
    },
    "categories"
  );

  return Array.isArray(data) ? data : [];
}
