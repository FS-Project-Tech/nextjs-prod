import { NextRequest, NextResponse } from "next/server";
import { cached, CACHE_TTL, CACHE_TAGS } from "@/lib/cache";

interface CatRow {
  id: number;
  name: string;
  slug: string;
  count: number;
}

/**
 * GET /api/brands/[slug]/categories
 * Categories that appear on products for this brand (from custom WP brands endpoint).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const decoded = decodeURIComponent(slug || "");
    if (!decoded) {
      return NextResponse.json({ categories: [] });
    }

    const base = process.env.NEXT_PUBLIC_WP_URL;
    if (!base) {
      return NextResponse.json({ categories: [] });
    }

    const cacheKey = `brand:categories:${decoded}`;

    const categories = await cached(
      cacheKey,
      async () => {
        const url = `${base.replace(/\/$/, "")}/wp-json/custom/v1/brands?slug=${encodeURIComponent(
          decoded
        )}&include_products=1`;
        const res = await fetch(url, { next: { revalidate: 600 } });
        if (!res.ok) return [] as CatRow[];

        const data = await res.json();
        const row = Array.isArray(data) ? data[0] : null;
        const products = Array.isArray(row?.products) ? row.products : [];

        const map = new Map<string, CatRow>();
        for (const p of products) {
          for (const c of Array.isArray(p?.categories) ? p.categories : []) {
            const s = String(c?.slug || "").trim();
            if (!s) continue;
            const existing = map.get(s);
            if (existing) {
              existing.count += 1;
            } else {
              map.set(s, {
                id: Number(c.id) || 0,
                name: String(c.name || s),
                slug: s,
                count: 1,
              });
            }
          }
        }

        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      },
      {
        ttl: CACHE_TTL.BRANDS,
        tags: [CACHE_TAGS.BRANDS],
      }
    );

    return NextResponse.json(
      { categories },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[api/brands/.../categories]", error);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
