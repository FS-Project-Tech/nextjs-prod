import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/woocommerce";
import { getUnifiedCategories } from "@/lib/categories-unified";
import { cached, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";
import { fetchJsonCached } from "@/services/api";

type BrandItem = {
  id?: number;
  name?: string;
  slug?: string;
  image?: string | { src?: string; thumbnail?: string } | null;
  count?: number;
};

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const perPage = Math.min(24, Math.max(1, Number(sp.get("per_page") || "12")));
    const page = Math.max(1, Number(sp.get("page") || "1"));
    const category = sp.get("category") || undefined;
    const skipCache = sp.get("nocache") === "1";

    const baseUrl = process.env.NEXT_PUBLIC_WP_URL?.replace(/\/+$/, "");
    const brandsUrl = baseUrl ? `${baseUrl}/wp-json/custom/v1/brands` : "";

    const cacheKey = `shop-data:v1:page=${page}:perPage=${perPage}:category=${category || ""}`;
    const payload = await cached(
      cacheKey,
      async () => {
        const [productsData, categoriesData, brandsData] = await Promise.all([
          fetchProducts({ page, per_page: perPage, category }),
          getUnifiedCategories(),
          brandsUrl
            ? fetchJsonCached<BrandItem[]>(brandsUrl, {
                cacheKey: "shop-data:brands:v1",
                ttlSeconds: CACHE_TTL.BRANDS,
                tags: [CACHE_TAGS.BRANDS],
                timeoutMs: 8000,
                retries: 1,
              })
            : Promise.resolve([] as BrandItem[]),
        ]);

        return {
          products: productsData?.products || [],
          total: productsData?.total || 0,
          totalPages: productsData?.totalPages || 1,
          categories: categoriesData?.categories || [],
          brands: Array.isArray(brandsData) ? brandsData : [],
        };
      },
      {
        ttl: 120,
        tags: [CACHE_TAGS.PRODUCTS, CACHE_TAGS.CATEGORIES, CACHE_TAGS.BRANDS],
        skipCache,
      }
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load shop data",
        products: [],
        total: 0,
        totalPages: 0,
        categories: [],
        brands: [],
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

