import {
  getProductSitemapEntries,
  getSitemapOrigin,
  sitemapXmlResponse,
  urlSetXml,
} from "@/lib/sitemap-utils";

export const runtime = "nodejs";
export const revalidate = 3600;

function parseSitemapPage(value: string): number | null {
  const page = Number.parseInt(value.replace(/\.xml$/i, ""), 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

export async function GET(_request: Request, context: { params: Promise<{ page: string }> }) {
  const { page: pageParam } = await context.params;
  const page = parseSitemapPage(pageParam);
  if (!page) {
    return new Response("Not found", { status: 404 });
  }

  const entries = await getProductSitemapEntries(page, getSitemapOrigin());
  return sitemapXmlResponse(urlSetXml(entries));
}
