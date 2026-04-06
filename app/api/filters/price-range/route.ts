import { NextRequest, NextResponse } from "next/server";
import { fetchCategoryBySlug, wcGet, type WooCommerceProduct } from "@/lib/woocommerce";
import { cached, CACHE_TTL, CACHE_TAGS, STATIC_CACHE_HEADERS } from "@/lib/cache";

/**
 * GET /api/filters/price-range
 * Returns min and max price for the price filter slider
 *
 * Query params:
 * - category: Optional category slug to get price range for specific category
 */
export async function GET(request: NextRequest) {
  try {
    const categorySlug = request.nextUrl.searchParams.get("category");
    const cacheKey = `price-range:${categorySlug || "all"}`;

    // Check for cache bypass
    const bypassCache = request.headers.get("cache-control")?.includes("no-cache");

    // Fetch price range with caching (prices don't change frequently)
    const priceRange = await cached(
      cacheKey,
      async () => {
        const params: Record<string, string | number> = {
          per_page: 1,
          orderby: "price",
          status: "publish",
          stock_status: "instock",
        };

        if (categorySlug) {
          try {
            const cat = await fetchCategoryBySlug(categorySlug);
            if (cat?.id) params.category = cat.id;
          } catch {
            /* global range */
          }
        }

        const [minResponse, maxResponse] = await Promise.all([
          wcGet<WooCommerceProduct[]>("/products", { ...params, order: "asc" }, "products"),
          wcGet<WooCommerceProduct[]>("/products", { ...params, order: "desc" }, "products"),
        ]);

        const minProduct = minResponse.data?.[0];
        const maxProduct = maxResponse.data?.[0];

        const minPrice = minProduct ? parseFloat(minProduct.price || "0") : 0;
        const maxPrice = maxProduct ? parseFloat(maxProduct.price || "1000") : 1000;

        return {
          min: Math.floor(minPrice),
          max: Math.ceil(maxPrice),
        };
      },
      {
        ttl: CACHE_TTL.STATIC, // Price ranges don't change often
        tags: [CACHE_TAGS.PRODUCTS],
        skipCache: bypassCache,
      }
    );

    return NextResponse.json(priceRange, {
      headers: {
        ...STATIC_CACHE_HEADERS,
        "X-Cache-Key": cacheKey,
      },
    });
  } catch (error) {
    console.error(
      "Error fetching price range:",
      error instanceof Error ? error.message : "An error occurred"
    );
    // Return default range on error
    return NextResponse.json(
      {
        min: 0,
        max: 1000,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
