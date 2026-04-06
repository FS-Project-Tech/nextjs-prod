import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/woocommerce";
import type { WooCommerceProduct } from "@/lib/woocommerce";
import { cached, productsKey, CACHE_TTL, CACHE_TAGS, PRODUCT_CACHE_HEADERS } from "@/lib/cache";
import { dedupeProductsById } from "@/lib/utils/product";

const isDev = process.env.NODE_ENV === "development";

const MAX_INCLUDE_IDS = 100;

function parseIncludeParam(raw: string | null): number[] {
  if (!raw?.trim()) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const n = parseInt(part.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
    if (ids.length >= MAX_INCLUDE_IDS) break;
  }
  return ids;
}

/**
 * Wishlist / batch-by-id only. Product listing uses `/api/typesense/search`.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeIds = parseIncludeParam(searchParams.get("include"));

    if (includeIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Use /api/typesense/search for catalog listing. This route accepts ?include=1,2,3 only.",
          products: [],
          total: 0,
          totalPages: 0,
        },
        { status: 400 }
      );
    }

    const perPage = Math.min(
      100,
      Math.max(includeIds.length, parseInt(searchParams.get("per_page") || "24", 10) || 24)
    );

    const params = {
      include: includeIds,
      per_page: perPage,
      page: 1,
    };

    const stableParams = { ...params };
    const cacheKey = productsKey(stableParams);

    const result = await cached(
      cacheKey,
      async () => {
        const raw = await fetchProducts({
          include: includeIds,
          per_page: perPage,
          page: 1,
        });

        const products = dedupeProductsById(
          (raw?.products || []).map((p: WooCommerceProduct) => {
            const price = p.price || "0";
            const regular = p.regular_price || "";
            const sale = p.sale_price || "";

            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              sku: p.sku || "",
              price,
              sale_price: sale,
              regular_price: regular,
              on_sale: p.on_sale || false,
              sale_percentage:
                regular && sale
                  ? Math.round(((Number(regular) - Number(sale)) / Number(regular)) * 100)
                  : null,
              image: p.images?.[0]?.src || "",
              image_alt: p.images?.[0]?.alt || p.name,
              average_rating: Number(p.average_rating || 0),
              rating_count: Number(p.rating_count || 0),
              tags: Array.isArray(p.tags)
                ? p.tags.map((t: { id?: number; name?: string; slug?: string }) => ({
                    id: t.id ?? 0,
                    name: t.name ?? "",
                    slug: t.slug ?? "",
                  }))
                : [],
            };
          }),
        );

        return {
          products,
          total: raw?.total ?? products.length,
          totalPages: raw?.totalPages ?? 1,
        };
      },
      {
        ttl: CACHE_TTL.PRODUCTS,
        tags: [CACHE_TAGS.PRODUCTS],
        skipCache: searchParams.get("nocache") === "1",
      }
    );

    return NextResponse.json(result, {
      headers: {
        ...PRODUCT_CACHE_HEADERS,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (isDev) console.error("❌ /api/products error:", error);

    return NextResponse.json(
      {
        error: "Unable to load products",
        products: [],
        total: 0,
        totalPages: 0,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
