import {
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import type { WooCommerceCategory } from "./types";
import { wcGet } from "./wc-fetch";

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

    return all;
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
    return categories.length ? categories[0] : null;
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
