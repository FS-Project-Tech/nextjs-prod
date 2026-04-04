import {
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import wcAPI from "./client";
import type { WooCommerceCategory } from "./types";

export const fetchCategories = async (params?: {
  per_page?: number;
  parent?: number;
  hide_empty?: boolean;
}): Promise<WooCommerceCategory[]> => {
  try {
    let page = 1;
    let all: WooCommerceCategory[] = [];

    while (true) {
      const response = await wcAPI.get("/products/categories", {
        params: {
          ...params,
          per_page: 100,
          page,
        },
      });

      const data = response.data || [];

      if (!data.length) break;

      all = [...all, ...data];

      if (data.length < 100) break;

      page++;
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
    const response = await wcAPI.get("/products/categories", { params: { slug } });
    const categories: WooCommerceCategory[] = response.data;
    return categories.length ? categories[0] : null;
  } catch (error: unknown) {
    const isTimeout =
      isTimeoutError(error) ||
      (hasAxiosResponse(error) &&
        ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
          getAxiosErrorDetails(error).code || ""
        ));

    if (process.env.NODE_ENV === "development" && !hasAxiosResponse(error) && !isTimeout) {
      console.warn(`Network error fetching category by slug "${slug}" (handled gracefully)`);
    }
    return null;
  }
};
