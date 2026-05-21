import {
  getSitemapOrigin,
  getStaticSitemapEntries,
  sitemapXmlResponse,
  urlSetXml,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  return sitemapXmlResponse(urlSetXml(getStaticSitemapEntries(getSitemapOrigin())));
}
