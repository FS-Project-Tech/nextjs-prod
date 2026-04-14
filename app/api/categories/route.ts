import { NextRequest, NextResponse } from "next/server";
import { getUnifiedCategories } from "@/lib/categories-unified";
import { STATIC_CACHE_HEADERS } from "@/lib/cache";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

/**
 * Single categories endpoint: one WooCommerce fetch (cached), tree included.
 * Query params are ignored.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const bypassCache =
      request.headers.get("cache-control")?.includes("no-cache") ||
      request.headers.get("x-bypass-cache") === "true";

    const payload = await getUnifiedCategories({ skipCache: bypassCache });

    return withRequestId(
      NextResponse.json(payload, {
        headers: {
          ...STATIC_CACHE_HEADERS,
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
        },
      }),
      requestId
    );
  } catch (error) {
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "Failed to fetch categories",
      fallbackBody: {
        categories: [],
        roots: [],
        childrenByParentId: {},
      },
      logPrefix: "api/categories",
    });
  }
}
