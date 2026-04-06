/**
 * Dynamic Sitemap Generation
 * Automatically generates sitemap.xml for all products and categories
 */

import { MetadataRoute } from "next";
import { fetchProducts } from "@/lib/woocommerce";
import { getUnifiedCategories } from "@/lib/categories-unified";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl;

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
  ];

  // Fetch products and categories
  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  try {
    // Fetch products directly
    const productsResult = await fetchProducts({ per_page: 100, orderby: "popularity" }).catch(
      () => ({ products: [] })
    );

    productPages = (productsResult.products || []).map((product) => ({
      url: `${baseUrl}/product/${product.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    const unified = await getUnifiedCategories().catch(() => ({
      categories: [] as { slug: string }[],
    }));
    const categories = unified.categories;

    categoryPages = categories.map((category) => ({
      url: `${baseUrl}/product-category/${category.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error("Error generating sitemap:", error);
    // Return static pages only if fetch fails
    return staticPages;
  }

  // Combine all pages
  return [...staticPages, ...productPages, ...categoryPages];
}
