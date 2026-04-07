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
    const filterActive = (rows: WooCommerceVariation[]): WooCommerceVariation[] =>
      rows.filter((v) => {
        const enabled = (v as { enabled?: unknown }).enabled;
        const status = String((v as { status?: unknown }).status || "").toLowerCase();
        // Keep only active variations; disabled/private/draft/trash should never appear on PDP.
        if (enabled === false) return false;
        if (status && status !== "publish") return false;
        return true;
      });

    // If caller explicitly requests a page, fetch only that page.
    if (params?.page) {
      const q: Record<string, unknown> = {
        ...(params || {}),
        per_page: params.per_page || 100,
      };
      const { data } = await wcGet<WooCommerceVariation[]>(
        `/products/${productId}/variations`,
        q,
        "product",
      );
      const rows = Array.isArray(data) ? data : [];
      return filterActive(rows);
    }

    const perPage = params?.per_page || 100;
    const first = await wcGet<WooCommerceVariation[]>(
      `/products/${productId}/variations`,
      { per_page: perPage, page: 1 },
      "product",
    );
    const firstRows = Array.isArray(first.data) ? first.data : [];
    const totalPages = Number.isFinite(first.wpTotalPages) ? Math.max(1, first.wpTotalPages as number) : 1;

    if (totalPages <= 1) {
      return filterActive(firstRows);
    }

    const allRows: WooCommerceVariation[] = [...firstRows];
    for (let page = 2; page <= totalPages; page++) {
      const next = await wcGet<WooCommerceVariation[]>(
        `/products/${productId}/variations`,
        { per_page: perPage, page },
        "product",
      );
      const pageRows = Array.isArray(next.data) ? next.data : [];
      allRows.push(...pageRows);
    }

    return filterActive(allRows);
  } catch (error: unknown) {
    console.error("Error fetching product variations:", getErrorMessage(error));
    throw error;
  }
};
