import {
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import { decodeHTMLEntities } from "@/lib/xss-sanitizer";
import type { WooCommerceCategory } from "./types";
import { wcGet } from "./wc-fetch";

/** WooCommerce stores HTML entities in plain fields (e.g. &amp; → show as &) */
function sanitizeCategory(cat: WooCommerceCategory): WooCommerceCategory {
  const image =
    cat.image?.src ?
      {
        src: cat.image.src,
        alt:
          cat.image.alt !== undefined && cat.image.alt !== null ?
            decodeHTMLEntities(String(cat.image.alt))
          : undefined,
      }
    : cat.image;

  return {
    ...cat,
    name: decodeHTMLEntities(String(cat.name ?? "")),
    description:
      cat.description !== undefined && cat.description !== null ?
        decodeHTMLEntities(String(cat.description))
      : cat.description,
    ...(image !== undefined ? { image } : {}),
  };
}

export const fetchCategories = async (params?: {
  per_page?: number;
  parent?: number;
  hide_empty?: boolean;
}): Promise<WooCommerceCategory[]> => {
  try {
    const baseQuery: Record<string, unknown> = {
      ...params,
      per_page: 100,
      page: 1,
    };

    const first = await wcGet<WooCommerceCategory[]>("/products/categories", baseQuery, "categories");
    let all: WooCommerceCategory[] = [...(first.data || [])];
    const totalPages = first.wpTotalPages ?? 1;

    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          wcGet<WooCommerceCategory[]>(
            "/products/categories",
            { ...baseQuery, page: i + 2 },
            "categories",
          ),
        ),
      );
      for (const r of rest) {
        all = all.concat(r.data || []);
      }
    }

    return all.map(sanitizeCategory);
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development" && hasAxiosResponse(error)) {
      const details = getAxiosErrorDetails(error);
      console.warn("Error fetching categories:", {
        status: details.status,
        url: details.url,
      });
    }

    return [];
  }
};

export const fetchCategoryBySlug = async (slug: string): Promise<WooCommerceCategory | null> => {
  try {
    const { data: categories } = await wcGet<WooCommerceCategory[]>(
      "/products/categories",
      { slug },
      "categories",
    );
    return categories.length ? sanitizeCategory(categories[0]) : null;
  } catch (error: unknown) {
    const isTimeout =
      isTimeoutError(error) ||
      (hasAxiosResponse(error) &&
        ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
          getAxiosErrorDetails(error).code || "",
        ));

    if (process.env.NODE_ENV === "development" && !hasAxiosResponse(error) && !isTimeout) {
      console.warn(`Network error fetching category by slug "${slug}" (handled gracefully)`);
    }
    return null;
  }
};
