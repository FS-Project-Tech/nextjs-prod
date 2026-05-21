import type { MetadataRoute } from "next";

import { getBrands } from "@/lib/brands";
import { fetchAllPostsForSitemap } from "@/lib/cms-posts";
import { getSitemapBaseUrl } from "@/lib/cms-seo";
import { getUnifiedCategories, type UnifiedCategory } from "@/lib/categories-unified";
import {
  fetchPublishedProductsForSitemapPage,
  getPublishedProductSitemapPageCount,
} from "@/lib/woocommerce/product-sitemap"; 

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type SitemapUrlEntry = {
  url: string;
  lastModified?: Date | string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
};

export type SitemapIndexEntry = {
  url: string;
  lastModified?: Date | string;
};

export const SITEMAP_REVALIDATE_SECONDS = 3600;
export const PRODUCT_SITEMAP_PATH = "product-sitemap";
export const PRODUCT_SITEMAP_FIRST_PAGE_PATH = "product-sitemap.xml";
export const SITEMAP_STYLESHEET_PATH = "sitemap.xsl";

function effectiveMaxProductPages(): number {
  const envMax = Number.parseInt(process.env.SITEMAP_MAX_PRODUCT_PAGES || "500", 10);
  const ceiling = Number.isFinite(envMax) && envMax > 0 ? envMax : 500;
  if (process.env.NODE_ENV !== "development") {
    return Math.min(ceiling, 2000);
  }
  const devCap = Number.parseInt(process.env.SITEMAP_DEV_MAX_PRODUCT_PAGES || "100", 10);
  const cap = Number.isFinite(devCap) && devCap > 0 ? devCap : 100;
  return Math.min(cap, ceiling);
}

function effectiveMaxBlogPages(): number {
  const n = Number.parseInt(process.env.SITEMAP_DEV_MAX_BLOG_PAGES || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function xmlHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/${SITEMAP_STYLESHEET_PATH}"?>`;
}

export function sitemapXmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}

export function sitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const body = entries
    .map((entry) => {
      const lastModified = isoDate(entry.lastModified);
      return [
        "  <sitemap>",
        `    <loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `    <lastmod>${lastModified}</lastmod>` : "",
        "  </sitemap>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `${xmlHeader()}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

export function urlSetXml(entries: SitemapUrlEntry[]): string {
  const body = entries
    .map((entry) => {
      const lastModified = isoDate(entry.lastModified);
      return [
        "  <url>",
        `    <loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `    <lastmod>${lastModified}</lastmod>` : "",
        entry.changeFrequency ? `    <changefreq>${entry.changeFrequency}</changefreq>` : "",
        typeof entry.priority === "number"
          ? `    <priority>${entry.priority.toFixed(1)}</priority>`
          : "",
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function getSitemapOrigin(): string {
  return trimTrailingSlash(getSitemapBaseUrl());
}

export function getStaticSitemapEntries(baseUrl = getSitemapOrigin()): SitemapUrlEntry[] {
  const now = new Date();
  return [
    { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/catalogue`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/clearance`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/b2b`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    {
      url: `${baseUrl}/medical-supplies-adelaide`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-brisbane-north`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-central-coast`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-coffs-harbour`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-melbourne`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-newcastle`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-sunshine-coast`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-sydney`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-toowoomba`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-townsville`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/medical-supplies-tweed-heads`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    { url: `${baseUrl}/events`, lastModified: now, changeFrequency: "weekly", priority: 0.65 },
    {
      url: `${baseUrl}/health-professionals`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/credit-application`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/credit-reporting-policy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    { url: `${baseUrl}/telehealth`, lastModified: now, changeFrequency: "monthly", priority: 0.65 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/brands`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
  ];
}

export async function getBlogSitemapEntries(
  baseUrl = getSitemapOrigin()
): Promise<SitemapUrlEntry[]> {
  const posts = await fetchAllPostsForSitemap(
    process.env.NODE_ENV === "development" ? { maxPages: effectiveMaxBlogPages() } : {}
  );

  const seenSlugs = new Set<string>();
  return posts
    .filter((post) => {
      const slug = (post.slug || "").trim();
      if (!slug || seenSlugs.has(slug)) return false;
      seenSlugs.add(slug);
      return true;
    })
    .map((post) => ({
      url: `${baseUrl}/blog/${encodeURIComponent(post.slug)}`,
      lastModified: post.modified ? new Date(post.modified) : new Date(post.date),
      changeFrequency: "monthly" as const,
      priority: 0.65,
    }));
}

function productSitemapUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/product/${encodeURIComponent(slug)}`;
}

export async function getProductSitemapEntries(
  sitemapPage: number,
  baseUrl = getSitemapOrigin()
): Promise<SitemapUrlEntry[]> {
  const products = await fetchPublishedProductsForSitemapPage(sitemapPage, {
    maxPages: effectiveMaxProductPages(),
  });

  const seenSlugs = new Set<string>();
  return products
    .filter((product) => {
      const slug = (product.slug || "").trim();
      if (!slug || seenSlugs.has(slug)) return false;
      seenSlugs.add(slug);
      return true;
    })
    .map((product) => ({
      url: productSitemapUrl(baseUrl, product.slug),
      lastModified: product.date_modified_gmt || product.date_modified || new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
}

export async function getProductSitemapIndexEntries(
  baseUrl = getSitemapOrigin()
): Promise<SitemapIndexEntry[]> {
  const count = await getPublishedProductSitemapPageCount({
    maxPages: effectiveMaxProductPages(),
  });
  const visibleCount = Math.max(1, count);

  return Array.from({ length: visibleCount }, (_, i) => ({
    url:
      i === 0
        ? `${baseUrl}/${PRODUCT_SITEMAP_FIRST_PAGE_PATH}`
        : `${baseUrl}/${PRODUCT_SITEMAP_PATH}/${i + 1}.xml`,
    lastModified: new Date(),
  }));
}

function buildCategoryPath(cat: UnifiedCategory, byId: Map<number, UnifiedCategory>): string {
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

export async function getCategorySitemapEntries(
  baseUrl = getSitemapOrigin()
): Promise<SitemapUrlEntry[]> {
  const unified = await getUnifiedCategories();
  const byId = new Map<number, UnifiedCategory>();
  for (const category of unified.categories) {
    byId.set(category.id, category);
  }

  return unified.categories.map((category) => {
    const path = buildCategoryPath(category, byId);
    return {
      url: `${baseUrl}/product-category/${path.split("/").map(encodeURIComponent).join("/")}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };
  });
}

async function brandsForSitemap() {
  const wp = (process.env.NEXT_PUBLIC_WP_URL || "").trim();
  if (!wp || /localhost|127\.0\.0\.1/i.test(wp)) {
    return [];
  }
  return getBrands();
}

export async function getBrandSitemapEntries(
  baseUrl = getSitemapOrigin()
): Promise<SitemapUrlEntry[]> {
  const brands = await brandsForSitemap();
  return brands
    .filter((brand) => (brand.slug || "").trim().length > 0)
    .map((brand) => ({
      url: `${baseUrl}/brands/${encodeURIComponent(brand.slug)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));
}
