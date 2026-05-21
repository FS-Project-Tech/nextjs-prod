import {
  getProductSitemapIndexEntries,
  getSitemapOrigin,
  sitemapIndexXml,
  sitemapXmlResponse,
  SITEMAP_REVALIDATE_SECONDS,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = SITEMAP_REVALIDATE_SECONDS;

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
      { url: `${baseUrl}/brand-sitemap.xml`, lastModified },
    ])
  );
}
