import {
  getErrorMessage,
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import wcAPI from "./client";
import { WC_REST_INSTOCK } from "./constants";
import type { WooCommerceProduct, WooCommerceVariation } from "./types";

export const fetchProduct = async (id: number): Promise<WooCommerceProduct> => {
  try {
    const response = await wcAPI.get(`/products/${id}`);
    return response.data;
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
    const response = await wcAPI.get("/products", { params: { slug: slug.trim() } });
    const products: WooCommerceProduct[] = response.data;

    if (!Array.isArray(products)) {
      return null;
    }

    return products.length > 0 ? products[0] : null;
  } catch (error: unknown) {
    const isTimeout =
      isTimeoutError(error) ||
      (hasAxiosResponse(error) &&
        ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
          getAxiosErrorDetails(error).code || ""
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
    const response = await wcAPI.get("/products", {
      params: { category: categoryId, ...WC_REST_INSTOCK },
    });
    return response.data;
  } catch (error: unknown) {
    console.error("Error fetching products by category:", getErrorMessage(error));
    throw error;
  }
};

export const fetchProductVariations = async (
  productId: number,
  params?: { per_page?: number; page?: number }
): Promise<WooCommerceVariation[]> => {
  try {
    const response = await wcAPI.get(`/products/${productId}/variations`, { params });
    return response.data;
  } catch (error: unknown) {
    console.error("Error fetching product variations:", getErrorMessage(error));
    throw error;
  }
};
