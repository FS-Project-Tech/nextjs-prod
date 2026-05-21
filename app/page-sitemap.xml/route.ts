import {
  getSitemapOrigin,
  getStaticSitemapEntries,
  sitemapXmlResponse,
  SITEMAP_REVALIDATE_SECONDS,
  urlSetXml,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = SITEMAP_REVALIDATE_SECONDS;

export async function GET() {
  return sitemapXmlResponse(urlSetXml(getStaticSitemapEntries(getSitemapOrigin())));
}
