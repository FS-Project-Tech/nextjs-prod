import { NextRequest, NextResponse } from "next/server";
import { getUnifiedCategories } from "@/lib/categories-unified";
import { STATIC_CACHE_HEADERS } from "@/lib/cache";

/**
 * Single categories endpoint: one WooCommerce fetch (cached), tree included.
 * Query params are ignored.
 */
export async function GET(request: NextRequest) {
  try {
    const bypassCache =
      request.headers.get("cache-control")?.includes("no-cache") ||
      request.headers.get("x-bypass-cache") === "true";

    const payload = await getUnifiedCategories({ skipCache: bypassCache });

    return NextResponse.json(payload, {
      headers: {
        ...STATIC_CACHE_HEADERS,
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
      },
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch categories",
        categories: [],
        roots: [],
        childrenByParentId: {},
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
