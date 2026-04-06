import { getWpBaseUrl } from "@/lib/wp-utils";
import {
  getErrorMessage,
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";
import wcAPI from "./client";
import { wcGet } from "./wc-fetch";
import type { WooCommerceProductReview } from "./types";

async function fetchProductReviewsCustomEndpoint(
  productId: number,
  params: { per_page: number; page: number }
): Promise<WooCommerceProductReview[]> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return [];
  const url = `${wpBase}/wp-json/custom/v1/products/${productId}/reviews?per_page=${params.per_page}&page=${params.page}`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? (body as WooCommerceProductReview[]) : [];
  } catch {
    return [];
  }
}

export const fetchProductReviews = async (
  productId: number,
  params?: { per_page?: number; page?: number }
): Promise<WooCommerceProductReview[]> => {
  const perPage = params?.per_page ?? 10;
  const page = params?.page ?? 1;
  try {
    const { data } = await wcGet<unknown[]>(
      "/products/reviews",
      { product: productId, per_page: perPage, page },
      "products",
    );
    const dataArr = data ?? [];
    if (Array.isArray(dataArr) && dataArr.length > 0) {
      return dataArr as WooCommerceProductReview[];
    }
    const custom = await fetchProductReviewsCustomEndpoint(productId, { per_page: perPage, page });
    return custom.length > 0 ? custom : (dataArr as WooCommerceProductReview[]);
  } catch (error: unknown) {
    const isNoRoute =
      hasAxiosResponse(error) &&
      typeof getAxiosErrorDetails(error).data === "object" &&
      getAxiosErrorDetails(error).data !== null &&
      "message" in (getAxiosErrorDetails(error).data as object) &&
      String((getAxiosErrorDetails(error).data as { message?: string }).message || "").includes(
        "No route was found"
      );
    const isTimeout =
      isTimeoutError(error) ||
      (hasAxiosResponse(error) &&
        ["ECONNABORTED", "ETIMEDOUT"].includes(getAxiosErrorDetails(error).code || ""));
    if (isNoRoute || isTimeout) {
      const custom = await fetchProductReviewsCustomEndpoint(productId, {
        per_page: perPage,
        page,
      });
      return custom;
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("Error fetching product reviews:", getErrorMessage(error));
    }
    const custom = await fetchProductReviewsCustomEndpoint(productId, { per_page: perPage, page });
    return custom;
  }
};

async function createProductReviewCustomEndpoint(
  productId: number,
  data: { reviewer: string; reviewer_email: string; review: string; rating: number }
): Promise<{ created: WooCommerceProductReview | null; error?: string }> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return { created: null, error: "WordPress URL not configured." };
  const url = `${wpBase}/wp-json/custom/v1/products/${productId}/reviews`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        body &&
        typeof body === "object" &&
        "message" in body &&
        typeof (body as { message: string }).message === "string"
          ? (body as { message: string }).message
          : res.statusText || "Failed to submit review.";
      return { created: null, error: msg };
    }
    const created = body as WooCommerceProductReview;
    if (created && (created.id != null || created.review != null)) {
      return { created };
    }
    return { created: null, error: "Invalid response from review endpoint." };
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if (process.env.NODE_ENV === "development") {
      console.warn("Custom review endpoint failed:", msg);
    }
    return { created: null, error: msg };
  }
}

export const createProductReview = async (
  productId: number,
  reviewPayload: { reviewer: string; reviewer_email: string; review: string; rating: number }
): Promise<{ created: WooCommerceProductReview | null; error?: string }> => {
  try {
    const response = await wcAPI.post("/products/reviews", {
      product_id: productId,
      ...reviewPayload,
    });
    return { created: response.data };
  } catch (wcError: unknown) {
    let message = getErrorMessage(wcError);
    if (hasAxiosResponse(wcError)) {
      const details = getAxiosErrorDetails(wcError);
      const errData = details.data;
      if (
        errData &&
        typeof errData === "object" &&
        "message" in errData &&
        typeof (errData as { message: string }).message === "string"
      ) {
        message = (errData as { message: string }).message;
      }
    }
    const isNoRoute =
      typeof message === "string" &&
      (message.includes("No route was found") || message.includes("rest_no_route"));
    if (isNoRoute) {
      const custom = await createProductReviewCustomEndpoint(productId, reviewPayload);
      if (custom.created) return { created: custom.created };
      if (custom.error) return { created: null, error: custom.error };
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("Error creating product review:", message);
    }
    return { created: null, error: message };
  }
};
