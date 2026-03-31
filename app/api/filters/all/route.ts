import { NextResponse } from "next/server";
import { cached, CACHE_TTL, CACHE_TAGS, STATIC_CACHE_HEADERS } from "@/lib/cache";
import wcAPI, { fetchCategories } from "@/lib/woocommerce";
import { getWpBaseUrl } from "@/lib/wp-utils";

interface FilterBrand {
  name: string;
  slug: string;
  count: number;
}

async function fetchAllBrands(): Promise<FilterBrand[]> {
  const normalize = (v: string) =>
    String(v || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-");

  // 1) Prefer WP taxonomy brands (most reliable for product_brand setups)
  try {
    const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
    if (base) {
      const taxonomies = ["product_brand", "pa_brand", "brand"];
      for (const tax of taxonomies) {
        const allTerms: any[] = [];
        for (let page = 1; page <= 20; page++) {
          const res = await fetch(
            `${base}/wp-json/wp/v2/${tax}?per_page=100&page=${page}&hide_empty=true`,
            { next: { revalidate: 300 } }
          );
          if (!res.ok) break;
          const terms = await res.json();
          const list = Array.isArray(terms) ? terms : [];
          if (!list.length) break;
          allTerms.push(...list);
          if (list.length < 100) break;
        }
        if (allTerms.length > 0) {
          return allTerms
            .map((t: any) => ({
              name: String(t.name || t.slug || ""),
              slug: normalize(t.slug || t.name),
              count: Number(t.count || 0),
            }))
            .filter((b) => b.slug && b.name)
            .sort((a, b) => a.name.localeCompare(b.name));
        }
      }
    }
  } catch {
    // fallback below
  }

  // 2) Fallback to WC attribute terms
  try {
    const attrRes = await wcAPI.get("/products/attributes");
    const attrs = Array.isArray(attrRes.data) ? attrRes.data : [];
    const brandAttr = attrs.find(
      (a: any) =>
        a?.slug === "product_brand" ||
        a?.slug === "brand" ||
        String(a?.name || "").toLowerCase() === "brand"
    );
    if (!brandAttr?.id) return [];
    const termsRes = await wcAPI.get(`/products/attributes/${brandAttr.id}/terms`, {
      params: { per_page: 100, hide_empty: true },
    });
    const terms = Array.isArray(termsRes.data) ? termsRes.data : [];
    return terms
      .map((t: any) => ({
        name: String(t.name || t.slug || ""),
        slug: normalize(t.slug || t.name),
        count: Number(t.count || 0),
      }))
      .filter((b: FilterBrand) => b.slug && b.name)
      .sort((a: FilterBrand, b: FilterBrand) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const payload = await cached(
      "filters:all:v3-fast",
      async () => {
        const [categories, allBrands] = await Promise.all([
          fetchCategories({
            per_page: 100,
            hide_empty: true,
          }),
          fetchAllBrands(),
        ]);

        return {
          categories: (categories || [])
            .map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              parent: c.parent || 0,
              count: c.count || 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          brandsByCategory: {},
          allBrands,
          mode: "fast-fallback",
        };
      },
      {
        ttl: CACHE_TTL.STATIC,
        tags: [CACHE_TAGS.BRANDS, CACHE_TAGS.CATEGORIES],
      }
    );

    return NextResponse.json(payload, {
      headers: {
        ...STATIC_CACHE_HEADERS,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Error fetching /api/filters/all:", error);
    try {
      const [categories, allBrands] = await Promise.all([
        fetchCategories({
          per_page: 100,
          hide_empty: true,
        }),
        fetchAllBrands(),
      ]);
      return NextResponse.json(
        {
          categories: (categories || [])
            .map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              parent: c.parent || 0,
              count: c.count || 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          brandsByCategory: {},
          allBrands,
          degraded: true,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        }
      );
    } catch {
      return NextResponse.json(
        { categories: [], brandsByCategory: {}, allBrands: [] },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
}

