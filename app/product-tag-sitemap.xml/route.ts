import {
  getProductTagSitemapEntries,
  getSitemapOrigin,
  sitemapXmlResponse,
  urlSetXml,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const entries = await getProductTagSitemapEntries(getSitemapOrigin());
  return sitemapXmlResponse(urlSetXml(entries));
}
