import {
  getBrandSitemapEntries,
  getSitemapOrigin,
  sitemapXmlResponse,
  SITEMAP_REVALIDATE_SECONDS,
  urlSetXml,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = SITEMAP_REVALIDATE_SECONDS;

export async function GET() {
  const entries = await getBrandSitemapEntries(getSitemapOrigin());
  return sitemapXmlResponse(urlSetXml(entries));
}
