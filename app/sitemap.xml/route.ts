import {
  getProductSitemapIndexEntries,
  getSitemapOrigin,
  sitemapIndexXml,
  sitemapXmlResponse,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const baseUrl = getSitemapOrigin();
  const lastModified = new Date();
  const productSitemaps = await getProductSitemapIndexEntries(baseUrl);

  return sitemapXmlResponse(
    sitemapIndexXml([
      { url: `${baseUrl}/page-sitemap.xml`, lastModified },
      { url: `${baseUrl}/post-sitemap.xml`, lastModified },
      ...productSitemaps,
      { url: `${baseUrl}/product-category-sitemap.xml`, lastModified },
      { url: `${baseUrl}/product-tag-sitemap.xml`, lastModified },
      { url: `${baseUrl}/brand-sitemap.xml`, lastModified },
    ])
  );
}
