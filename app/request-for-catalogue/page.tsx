import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import PrefetchLink from "@/components/PrefetchLink";
import RequestForCatalogueForm from "@/components/RequestForCatalogueForm";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { sanitizeWordPressPageHTML, decodeHTMLEntities, stripHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

/** Remove MetForm / shortcodes so headless page can show optional WP intro HTML only */
function stripMetformShortcodes(html: string): string {
  return html.replace(/\[\s*metform[^\]]*\]/gi, "").trim();
}

/** WordPress page slug (Pages → Request For Catalogue) */
const WP_SLUG = "request-for-catalogue";

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPageBySlug(WP_SLUG);
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Request For Catalogue";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
  return {
    title: `${title} | Joya Medical Supplies`,
    description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
    alternates: { canonical: `${siteUrl}/request-for-catalogue` },
    openGraph: {
      title,
      description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
      type: "website",
      url: `${siteUrl}/request-for-catalogue`,
    },
  };
}

export default async function RequestForCataloguePage() {
  const page = await fetchPageBySlug(WP_SLUG);
  if (!page) notFound();

  const title = decodeHTMLEntities(
    page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Request For Catalogue"
  );
  const content = page.content?.rendered || "";
  const contentWithoutShortcodes = stripMetformShortcodes(content);
  const introHtml = sanitizeWordPressPageHTML(contentWithoutShortcodes);
  const introText = stripHTML(introHtml);
  const showWpIntro = introText.length > 20;

  let featuredImg = page._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (!featuredImg && content) {
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) featuredImg = imgMatch[1];
  }

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-white">
        <section className="border-b border-gray-100 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
            <nav className="mb-6 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="font-medium text-gray-900">{title}</li>
              </ol>
            </nav>
            {featuredImg && (
              <div className="mb-8 flex justify-center lg:hidden">
                <div className="relative aspect-[4/3] w-full max-w-lg overflow-hidden rounded-lg">
                  <Image src={featuredImg} alt="" fill className="object-cover" sizes="100vw" />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="container mx-auto px-4 pb-12 sm:px-6 md:px-8 md:pb-16">
          <h1 className="mb-6 text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
          {showWpIntro ? (
            <div
              className="request-catalogue-page-content nursing-page-content prose prose-lg mb-10 max-w-none text-gray-800"
              dangerouslySetInnerHTML={{ __html: introHtml }}
            />
          ) : null}
          <RequestForCatalogueForm />
        </section>
      </div>
    </>
  );
}
