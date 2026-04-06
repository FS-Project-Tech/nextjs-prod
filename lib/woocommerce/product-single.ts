import {
  getErrorMessage,
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import { WC_REST_INSTOCK } from "./constants";
import type { WooCommerceProduct, WooCommerceVariation } from "./types";
import { wcGet } from "./wc-fetch";

export const fetchProduct = async (id: number): Promise<WooCommerceProduct> => {
  try {
    const { data } = await wcGet<WooCommerceProduct>(`/products/${id}`, undefined, "product");
    return data;
  } catch (error: unknown) {
    console.error("Error fetching product:", getErrorMessage(error));
    throw error;
  }
};

export const fetchProductBySlug = async (slug: string): Promise<WooCommerceProduct | null> => {
  if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
    return null;
  }

  try {
    const { data: products } = await wcGet<WooCommerceProduct[]>(
      "/products",
      { slug: slug.trim() },
      "product",
    );

    if (!Array.isArray(products)) {
      return null;
    }

    return products.length > 0 ? products[0] : null;
  } catch (error: unknown) {
    const isTimeout =
      isTimeoutError(error) ||
      (hasAxiosResponse(error) &&
        ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
          getAxiosErrorDetails(error).code || "",
        ));

    if (process.env.NODE_ENV === "development" && !isTimeout) {
      const message = getErrorMessage(error);
      const status = hasAxiosResponse(error) ? getAxiosErrorDetails(error).status : undefined;
      console.warn(`[fetchProductBySlug] Failed for "${slug}":`, { message, status });
    }

    return null;
  }
};

export const fetchProductsByCategory = async (categoryId: number): Promise<WooCommerceProduct[]> => {
  try {
    const { data } = await wcGet<WooCommerceProduct[]>(
      "/products",
      { category: categoryId, ...WC_REST_INSTOCK },
      "products",
    );
    return data;
  } catch (error: unknown) {
    console.error("Error fetching products by category:", getErrorMessage(error));
    throw error;
  }
};

export const fetchProductVariations = async (
  productId: number,
  params?: { per_page?: number; page?: number },
): Promise<WooCommerceVariation[]> => {
  try {
    const q: Record<string, unknown> = { ...(params || {}) };
    const { data } = await wcGet<WooCommerceVariation[]>(
      `/products/${productId}/variations`,
      q,
      "product",
    );
    return data;
  } catch (error: unknown) {
    console.error("Error fetching product variations:", getErrorMessage(error));
    throw error;
  }
};
