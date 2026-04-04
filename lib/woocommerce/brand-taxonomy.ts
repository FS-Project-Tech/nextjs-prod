import { getWpBaseUrl } from "@/lib/wp-utils";
import { extractProductBrands } from "@/lib/utils/product";
import wcAPI from "./client";
import { WC_REST_INSTOCK } from "./constants";
import type { PaginatedProductResponse, WooCommerceProduct } from "./types";
import { applySortBy } from "./sort-products";

async function filterIdsToInStockProductIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const inStock = new Set<number>();
  const chunk = 100;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    try {
      const res = await wcAPI.get("/products", {
        params: {
          include: slice.join(","),
          per_page: slice.length,
          ...WC_REST_INSTOCK,
        },
      });
      const rows: Array<{ id?: number }> = Array.isArray(res.data) ? res.data : [];
      rows.forEach((p) => {
        if (p?.id != null) inStock.add(p.id);
      });
    } catch {
      /* skip chunk */
    }
  }
  return unique.filter((id) => inStock.has(id));
}

async function getProductIdsByBrandTerm(
  base: string,
  taxonomyUsed: string,
  termId: number,
  maxIds: number = 5000
): Promise<number[]> {
  const ids: number[] = [];
  let wpPage = 1;
  const perPage = 100;
  while (ids.length < maxIds) {
    const res = await fetch(
      `${base}/wp-json/wp/v2/product?${taxonomyUsed}=${termId}&per_page=${perPage}&page=${wpPage}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) break;
    const posts: unknown[] = await res.json();
    const pageIds = Array.isArray(posts)
      ? posts.map((p) => (p as { id?: number }).id).filter((id) => id != null)
      : [];
    if (pageIds.length === 0) break;
    ids.push(...(pageIds as number[]));
    const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);
    if (wpPage >= totalPages) break;
    wpPage += 1;
  }
  return ids;
}

async function resolveBrandSlugToTerm(
  base: string,
  brandSlug: string
): Promise<{ taxonomyUsed: string; termId: number } | null> {
  const slugEnc = encodeURIComponent(brandSlug.toLowerCase().trim());
  const taxonomyEndpoints = ["product_brand", "pa_brand", "brand"];
  for (const tax of taxonomyEndpoints) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/${tax}?slug=${slugEnc}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const term = Array.isArray(data) ? data[0] : data;
      if (term && term.id != null) return { taxonomyUsed: tax, termId: Number(term.id) };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchProductsByBrandTaxonomy(
  brandSlug: string,
  page: number,
  perPage: number,
  categoryId?: number,
  sortBy?: string
): Promise<PaginatedProductResponse> {
  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
  if (!base) return { products: [], total: 0, totalPages: 0, page, perPage };

  const resolved = await resolveBrandSlugToTerm(base, brandSlug);
  if (!resolved) return { products: [], total: 0, totalPages: 0, page, perPage };

  const { taxonomyUsed, termId } = resolved;
  const allIds = await getProductIdsByBrandTerm(base, taxonomyUsed, termId);
  if (allIds.length === 0) return { products: [], total: 0, totalPages: 0, page, perPage };

  let filteredIds = allIds;
  if (categoryId != null) {
    const inCategory: number[] = [];
    let wcPage = 1;
    const wcPerPage = 100;
    while (true) {
      const wcRes = await wcAPI.get("/products", {
        params: {
          category: categoryId,
          per_page: wcPerPage,
          page: wcPage,
          ...WC_REST_INSTOCK,
        },
      });
      const products: unknown[] = wcRes.data || [];
      if (products.length === 0) break;
      const idSet = new Set(allIds);
      products.forEach((p: unknown) => {
        const id = (p as { id?: number }).id;
        if (id != null && idSet.has(id)) inCategory.push(id);
      });
      if (products.length < wcPerPage) break;
      wcPage += 1;
    }
    filteredIds = inCategory;
  } else {
    filteredIds = await filterIdsToInStockProductIds(allIds);
  }

  const total = filteredIds.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const pageIds = filteredIds.slice(start, start + perPage);
  if (pageIds.length === 0) return { products: [], total, totalPages, page, perPage };

  const wcRes = await wcAPI.get("/products", {
    params: {
      include: pageIds.join(","),
      per_page: pageIds.length,
      ...WC_REST_INSTOCK,
    },
  });
  const products: unknown[] = wcRes.data || [];
  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  let sorted = [...products].sort(
    (a: unknown, b: unknown) =>
      (orderMap.get((a as { id: number }).id) ?? 0) - (orderMap.get((b as { id: number }).id) ?? 0)
  );

  if (sortBy) {
    sorted = applySortBy(sorted, sortBy);
  }

  return { products: sorted as WooCommerceProduct[], total, totalPages, page, perPage };
}

export async function fetchProductsByBrandTaxonomyMulti(
  brandSlugs: string[],
  categoryId: number | undefined,
  page: number,
  perPage: number,
  sortBy?: string
): Promise<PaginatedProductResponse> {
  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
  if (!base) return { products: [], total: 0, totalPages: 0, page, perPage };

  const slugSet = new Set(brandSlugs.map((s) => s.toLowerCase().trim()).filter(Boolean));
  if (slugSet.size === 0) return { products: [], total: 0, totalPages: 0, page, perPage };

  const allIds = new Set<number>();
  for (const slug of slugSet) {
    const resolved = await resolveBrandSlugToTerm(base, slug);
    if (!resolved) continue;
    const ids = await getProductIdsByBrandTerm(base, resolved.taxonomyUsed, resolved.termId);
    ids.forEach((id) => allIds.add(id));
  }
  let filteredIds = Array.from(allIds);
  if (categoryId != null) {
    const inCategory: number[] = [];
    let wcPage = 1;
    const wcPerPage = 100;
    const idSet = new Set(filteredIds);
    while (true) {
      const wcRes = await wcAPI.get("/products", {
        params: {
          category: categoryId,
          per_page: wcPerPage,
          page: wcPage,
          ...WC_REST_INSTOCK,
        },
      });
      const products: unknown[] = wcRes.data || [];
      if (products.length === 0) break;
      products.forEach((p: unknown) => {
        const id = (p as { id?: number }).id;
        if (id != null && idSet.has(id)) inCategory.push(id);
      });
      if (products.length < wcPerPage) break;
      wcPage += 1;
    }
    filteredIds = inCategory;
  } else {
    filteredIds = await filterIdsToInStockProductIds(filteredIds);
  }

  const total = filteredIds.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const pageIds = filteredIds.slice(start, start + perPage);
  if (pageIds.length === 0) return { products: [], total, totalPages, page, perPage };

  const wcRes = await wcAPI.get("/products", {
    params: {
      include: pageIds.join(","),
      per_page: pageIds.length,
      ...WC_REST_INSTOCK,
    },
  });
  const products: unknown[] = wcRes.data || [];
  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  let sorted = [...products].sort(
    (a: unknown, b: unknown) =>
      (orderMap.get((a as { id: number }).id) ?? 0) - (orderMap.get((b as { id: number }).id) ?? 0)
  );

  if (sortBy) {
    sorted = applySortBy(sorted, sortBy);
  }

  return { products: sorted as WooCommerceProduct[], total, totalPages, page, perPage };
}

export async function filterCategoryProductsByBrandSlugs(
  categoryId: number,
  requestedBrandSlugs: string[],
  sortBy: string | undefined,
  pageNum: number,
  perPageNum: number
): Promise<PaginatedProductResponse | null> {
  const normalize = (v: string) => v.toLowerCase().trim().replace(/\s+/g, "-");
  const wanted = new Set(requestedBrandSlugs.map(normalize));
  const allCategoryProducts: WooCommerceProduct[] = [];
  let rescuePage = 1;
  const rescuePerPage = 100;
  const rescueMaxPages = 10;

  while (rescuePage <= rescueMaxPages) {
    const rescueRes = await wcAPI.get("/products", {
      params: {
        category: categoryId,
        per_page: rescuePerPage,
        page: rescuePage,
        ...WC_REST_INSTOCK,
      },
    });

    const items: WooCommerceProduct[] = Array.isArray(rescueRes.data) ? rescueRes.data : [];
    if (items.length === 0) break;
    allCategoryProducts.push(...items);
    if (items.length < rescuePerPage) break;
    rescuePage += 1;
  }

  const matched = allCategoryProducts.filter((product) => {
    const brands = extractProductBrands(product);
    return brands.some((b) => {
      const slug = b.slug ? normalize(b.slug) : "";
      const name = b.name ? normalize(b.name) : "";
      return (slug && wanted.has(slug)) || (name && wanted.has(name));
    });
  });

  if (matched.length === 0) return null;

  let sortedMatched = matched;
  if (sortBy) {
    sortedMatched = applySortBy(sortedMatched, sortBy) as WooCommerceProduct[];
  }

  const start = (pageNum - 1) * perPageNum;
  const paged = sortedMatched.slice(start, start + perPageNum);

  return {
    products: paged,
    total: sortedMatched.length,
    totalPages: Math.max(1, Math.ceil(sortedMatched.length / perPageNum)),
    page: pageNum,
    perPage: perPageNum,
  };
}
