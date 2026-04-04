import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { sanitizeWordPressPageHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

const WP_SLUG = "b2b";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPageBySlug(WP_SLUG);
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "B2B";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    title: `${title} | Joya Medical Supplies`,
    description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
    alternates: { canonical: `${siteUrl}/b2b` },
    openGraph: {
      title,
      description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
      type: "website",
      url: `${siteUrl}/b2b`,
    },
  };
}

export default async function B2BPage() {
  const page = await fetchPageBySlug(WP_SLUG);
  if (!page) notFound();

  const title = decodeHTMLEntities(page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "B2B");
  const content = page.content?.rendered || "";

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
          {/* Same typography as Nursing — bullets & numbered lists in globals.css */}
          <div
            className="nursing-page-content b2b-page-content mx-auto max-w-8xl text-gray-900"
            dangerouslySetInnerHTML={{
              __html: sanitizeWordPressPageHTML(content),
            }}
          />
        </section>
      </div>
    </>
  );
}
