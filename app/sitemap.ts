/**
 * Dynamic Sitemap Generation
 * Automatically generates sitemap.xml for static pages, products, categories, and brands.
 *
 * Local dev: products are loaded in WooCommerce ID order (100 per page). A low page cap
 * hides later IDs from /sitemap.xml. Set `SITEMAP_DEV_MAX_PRODUCT_PAGES` in `.env.local`
 * (e.g. `500` for parity with production) if a SKU/slug is missing locally.
 */

import { MetadataRoute } from "next";
import { fetchPublishedProductsForSitemap } from "@/lib/woocommerce";
import { getUnifiedCategories, type UnifiedCategory } from "@/lib/categories-unified";
import { getBrands } from "@/lib/brands";
import { getSitemapBaseUrl } from "@/lib/cms-seo";
import { fetchAllPostsForSitemap } from "@/lib/cms-posts";

/** Paginated Woo `/products` requests for sitemap (100 products per page). Override via env. */
function effectiveMaxProductPages(): number {
  const envMax = Number.parseInt(process.env.SITEMAP_MAX_PRODUCT_PAGES || "500", 10);
  const ceiling = Number.isFinite(envMax) && envMax > 0 ? envMax : 500;
  if (process.env.NODE_ENV !== "development") {
    return Math.min(ceiling, 2000);
  }
  /** Default 100 pages = up to 10k products in dev; raise via env if your catalog is larger. */
  const devCap = Number.parseInt(process.env.SITEMAP_DEV_MAX_PRODUCT_PAGES || "100", 10);
  const cap = Number.isFinite(devCap) && devCap > 0 ? devCap : 100;
  return Math.min(cap, ceiling);
}

/** In dev, limit WordPress post pages so /sitemap.xml stays fast. */
function effectiveMaxBlogPages(): number {
  const n = Number.parseInt(process.env.SITEMAP_DEV_MAX_BLOG_PAGES || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * getBrands() falls back to http://localhost:3000 when NEXT_PUBLIC_WP_URL is unset.
 * Fetching the same Next dev server from a route handler can deadlock or hang /sitemap.xml.
 */
async function brandsForSitemap() {
  const wp = (process.env.NEXT_PUBLIC_WP_URL || "").trim();
  if (!wp || /localhost|127\.0\.0\.1/i.test(wp)) {
    return [];
  }
  return getBrands();
}

function buildCategoryPath(
  cat: UnifiedCategory,
  byId: Map<number, UnifiedCategory>
): string {
  const parts: string[] = [];
  const seen = new Set<number>();
  let current: UnifiedCategory | undefined = cat;
  while (current && !seen.has(current.id)) {
    parts.unshift(current.slug);
    seen.add(current.id);
    const pid = current.parent;
    current = pid && pid > 0 ? byId.get(pid) : undefined;
  }
  return parts.join("/");
}

/** `<loc>` path must match `/product/[slug]` (single segment; slug is already Woo-safe). */
function productSitemapUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/product/${encodeURIComponent(slug)}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSitemapBaseUrl();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/catalogue`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/clearance`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/b2b`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.65,
    },
    {
      url: `${baseUrl}/health-professionals`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/credit-application`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/telehealth`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.65,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/brands`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.75,
    },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];
  let brandPages: MetadataRoute.Sitemap = [];
  let blogPostPages: MetadataRoute.Sitemap = [];

  try {
    const [products, unified, brands, blogPosts] = await Promise.all([
      fetchPublishedProductsForSitemap({ maxPages: effectiveMaxProductPages() }),
      getUnifiedCategories(),
      brandsForSitemap(),
      fetchAllPostsForSitemap(
        process.env.NODE_ENV === "development" ? { maxPages: effectiveMaxBlogPages() } : {},
      ),
    ]);

    const seenBlogSlugs = new Set<string>();
    blogPostPages = blogPosts
      .filter((p) => {
        const s = (p.slug || "").trim();
        if (!s || seenBlogSlugs.has(s)) return false;
        seenBlogSlugs.add(s);
        return true;
      })
      .map((post) => ({
        url: `${baseUrl}/blog/${encodeURIComponent(post.slug)}`,
        lastModified: post.modified ? new Date(post.modified) : new Date(post.date),
        changeFrequency: "monthly" as const,
        priority: 0.65,
      }));

    const seenProductSlugs = new Set<string>();
    productPages = products
      .filter((p) => {
        const s = (p.slug || "").trim();
        if (!s || seenProductSlugs.has(s)) return false;
        seenProductSlugs.add(s);
        return true;
      })
      .map((product) => ({
        url: productSitemapUrl(baseUrl, product.slug),
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    const byId = new Map<number, UnifiedCategory>();
    for (const c of unified.categories) {
      byId.set(c.id, c);
    }

    categoryPages = unified.categories.map((category) => {
      const path = buildCategoryPath(category, byId);
      return {
        url: `${baseUrl}/product-category/${path.split("/").map(encodeURIComponent).join("/")}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    });

    brandPages = brands
      .filter((b) => (b.slug || "").trim().length > 0)
      .map((brand) => ({
        url: `${baseUrl}/brands/${encodeURIComponent(brand.slug)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));
  } catch (error) {
    console.error("Error generating sitemap:", error);
    return staticPages;
  }

  return [...staticPages, ...blogPostPages, ...productPages, ...categoryPages, ...brandPages];
}
