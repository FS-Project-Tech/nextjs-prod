import { normalizeError, isTimeoutError } from "@/lib/utils/errors";
import { WC_REST_INSTOCK } from "./constants";
import type { PaginatedProductResponse, WooCommerceCategory, WooCommerceProduct } from "./types";
import { wcGet } from "./wc-fetch";
import {
  fetchProductsByBrandTaxonomy,
  fetchProductsByBrandTaxonomyMulti,
  filterCategoryProductsByBrandSlugs,
} from "./brand-taxonomy";

export const fetchProducts = async (params?: {
  per_page?: number;
  page?: number;
  orderby?: string;
  order?: string;
  category?: string | number;
  search?: string;
  featured?: boolean;
  categorySlug?: string;
  categories?: string;
  brands?: string;
  tags?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  include?: number[];
  on_sale?: boolean;
  context?: "view" | "edit";
}): Promise<PaginatedProductResponse> => {
  try {
    const cleanParams: Record<string, unknown> = {};

    if (params?.per_page !== undefined && params.per_page > 0) {
      cleanParams.per_page = params.per_page;
    } else {
      cleanParams.per_page = 24;
    }

    if (params?.page !== undefined && params.page > 0) {
      cleanParams.page = params.page;
    } else {
      cleanParams.page = 1;
    }

    if (params?.sortBy) {
      switch (params.sortBy) {
        case "price_low":
          cleanParams.orderby = "price";
          cleanParams.order = "asc";
          break;
        case "price_high":
          cleanParams.orderby = "price";
          cleanParams.order = "desc";
          break;
        case "newest":
          cleanParams.orderby = "date";
          cleanParams.order = "desc";
          break;
        case "rating":
          cleanParams.orderby = "rating";
          cleanParams.order = "desc";
          break;
        case "popularity":
          cleanParams.orderby = "popularity";
          cleanParams.order = "desc";
          break;
        default:
          cleanParams.orderby = "menu_order";
          cleanParams.order = "asc";
      }
    } else {
      const validOrderBy = [
        "date",
        "id",
        "include",
        "title",
        "slug",
        "price",
        "popularity",
        "rating",
        "menu_order",
      ];
      if (params?.orderby && validOrderBy.includes(params.orderby)) {
        cleanParams.orderby = params.orderby;
      }

      if (params?.order && ["asc", "desc"].includes(params.order.toLowerCase())) {
        cleanParams.order = params.order.toLowerCase();
      }
    }

    const resolveCategorySlug = async (slug: string): Promise<number | null> => {
      try {
        const { data: categories } = await wcGet<WooCommerceCategory[]>(
          "/products/categories",
          { slug },
          "categories",
        );
        if (categories?.length) {
          console.log(`🏷️ Resolved category slug "${slug}" → ID ${categories[0].id}`);
          return categories[0].id;
        }
        console.warn(`⚠️ Category slug "${slug}" not found`);
        return null;
      } catch (error: unknown) {
        const normalized = normalizeError(error);
        console.warn(`⚠️ Failed to resolve category slug "${slug}":`, normalized.message);
        return null;
      }
    };

    let categoryId: number | undefined;

    if (params?.category !== undefined && params.category !== "" && params.category !== null) {
      const catVal = String(params.category);
      const parsed = parseInt(catVal, 10);
      if (!isNaN(parsed)) {
        categoryId = parsed;
      } else {
        const resolved = await resolveCategorySlug(catVal);
        if (resolved) categoryId = resolved;
      }
    } else if (params?.categorySlug) {
      const resolved = await resolveCategorySlug(params.categorySlug);
      if (resolved) categoryId = resolved;
    } else if (params?.categories) {
      const catVal = String(params.categories);
      const parsed = parseInt(catVal, 10);
      if (!isNaN(parsed)) {
        categoryId = parsed;
      } else {
        const resolved = await resolveCategorySlug(catVal);
        if (resolved) categoryId = resolved;
      }
    }

    if (categoryId !== undefined) {
      cleanParams.category = categoryId;
    }

    const resolveBrandToAttributeAndTermId = async (
      slug: string
    ): Promise<{ attribute: string; attribute_term: number } | null> => {
      const slugTrim = String(slug).trim().toLowerCase();
      const slugNorm = slugTrim.replace(/\s+/g, "-");
      const asNum = parseInt(slugTrim, 10);
      const isNumericId = !isNaN(asNum) && String(asNum) === slugTrim;

      const matchBrandAttr = (a: { slug?: string; name?: string }) => {
        const s = (a.slug || "").toLowerCase();
        const n = (a.name || "").toLowerCase();
        return (
          s === "product_brand" ||
          s === "brand" ||
          s === "brands" ||
          s === "product_brands" ||
          n === "brand" ||
          n === "brands"
        );
      };

      try {
        const attrRes = await wcGet<unknown[]>("/products/attributes", {}, "products");
        const attributes = Array.isArray(attrRes.data) ? attrRes.data : [];
        const brandAttr = attributes.find(matchBrandAttr) as
          | { id: number; slug?: string; name?: string }
          | undefined;
        if (!brandAttr?.id) return null;

        const attributeTaxonomy = brandAttr.slug ? `pa_${brandAttr.slug}` : "pa_brand";

        if (isNumericId) {
          return { attribute: attributeTaxonomy, attribute_term: asNum };
        }

        const termsRes = await wcGet<unknown[]>(
          `/products/attributes/${brandAttr.id}/terms`,
          { per_page: 250, orderby: "name", order: "asc" },
          "products",
        );
        const terms = (Array.isArray(termsRes.data) ? termsRes.data : []) as Array<{
          slug?: string;
          name?: string;
          id?: number;
        }>;
        const term = terms.find(
          (t) =>
            (t.slug || "").toLowerCase() === slugNorm ||
            (t.slug || "").toLowerCase() === slugTrim ||
            (t.name || "").toLowerCase() === slugTrim.replace(/-/g, " "),
        );
        if (!term || term.id == null) return null;
        return { attribute: attributeTaxonomy, attribute_term: Number(term.id) };
      } catch {
        return null;
      }
    };

    let singleBrandSlugForFallback: string | null = null;
    let requestedBrandSlugs: string[] = [];

    if (params?.brands && params.brands !== "") {
      const brandVal = String(params.brands).trim();
      const brandSlugs = brandVal
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      requestedBrandSlugs = brandSlugs.map((s) => s.toLowerCase());
      const firstSlug = brandSlugs[0];
      if (!firstSlug) {
        /* no-op */
      } else if (brandSlugs.length === 1) {
        const resolved = await resolveBrandToAttributeAndTermId(firstSlug);
        if (resolved) {
          cleanParams.attribute = resolved.attribute;
          cleanParams.attribute_term = resolved.attribute_term;
          singleBrandSlugForFallback = firstSlug;
        } else {
          const pageNum = (cleanParams.page as number) || 1;
          const perPageNum = (cleanParams.per_page as number) || 24;
          return fetchProductsByBrandTaxonomy(
            firstSlug,
            pageNum,
            perPageNum,
            categoryId,
            params.sortBy
          );
        }
      } else {
        const pageNum = (cleanParams.page as number) || 1;
        const perPageNum = (cleanParams.per_page as number) || 24;
        return fetchProductsByBrandTaxonomyMulti(
          brandSlugs,
          categoryId,
          pageNum,
          perPageNum,
          params.sortBy
        );
      }
    }

    if (params?.tags) {
      cleanParams.tag = params.tags;
    }

    if (params?.minPrice) {
      cleanParams.min_price = params.minPrice;
    }
    if (params?.maxPrice) {
      cleanParams.max_price = params.maxPrice;
    }

    if (params?.search && params.search.trim()) {
      cleanParams.search = params.search.trim();
    }

    if (params?.featured !== undefined) {
      cleanParams.featured = params.featured ? 1 : 0;
    }
    if (params?.on_sale === true) {
      cleanParams.on_sale = true;
    }

    if (params?.context === "edit" || params?.context === "view") {
      cleanParams.context = params.context;
    }

    if (params?.include && params.include.length > 0) {
      cleanParams.include = params.include.join(",");
      cleanParams.per_page = Math.max((cleanParams.per_page as number) || 24, params.include.length);
    }

    Object.assign(cleanParams, WC_REST_INSTOCK);

    console.log("🛒 WooCommerce Request:", {
      endpoint: "/products",
      params: cleanParams,
    });

    const response = await wcGet<WooCommerceProduct[]>("/products", cleanParams, "products");

    const total = response.wpTotal ?? 0;
    const totalPages = response.wpTotalPages ?? 1;

    console.log("✅ WooCommerce Response:", {
      productsCount: response.data?.length || 0,
      total,
      totalPages,
      page: cleanParams.page,
    });

    if (singleBrandSlugForFallback && (response.data?.length || 0) === 0 && Number(total) === 0) {
      const pageNum = (cleanParams.page as number) || 1;
      const perPageNum = (cleanParams.per_page as number) || 24;
      return fetchProductsByBrandTaxonomy(
        singleBrandSlugForFallback,
        pageNum,
        perPageNum,
        categoryId,
        params?.sortBy
      );
    }

    if (
      categoryId != null &&
      requestedBrandSlugs.length > 0 &&
      (response.data?.length || 0) === 0 &&
      Number(total) === 0
    ) {
      const fallback = await filterCategoryProductsByBrandSlugs(
        categoryId,
        requestedBrandSlugs,
        params?.sortBy,
        (cleanParams.page as number) || 1,
        (cleanParams.per_page as number) || 24
      );
      if (fallback) return fallback;
    }

    return {
      products: response.data || [],
      total,
      totalPages,
      page: cleanParams.page as number,
      perPage: cleanParams.per_page as number,
    };
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      throw new Error("GraphQL request timeout");
    }
    throw error;
  }
};
