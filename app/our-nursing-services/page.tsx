import type { Metadata } from "next";
import PrefetchLink from "@/components/PrefetchLink";
import CmsPageFallback from "@/components/CmsPageFallback";
import NursingServiceCard from "@/components/NursingServiceCard";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { getPublicSiteOrigin } from "@/lib/cms-seo";
import { decodeHTMLEntities, sanitizeWordPressPageHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import {
  getOurNursingServicesCards,
  getOurNursingServiceDetailSlugs,
} from "@/lib/our-nursing-services-cards";
import { rewriteNursingHubLinksToNext } from "@/lib/nursing-service-routes";

export const dynamic = "force-dynamic";

const HUB_WP_SLUG = "our-nursing-services";

/** Avoid duplicate title when WP body repeats the same H1 as the page title. */
function stripLeadingDuplicateH1(html: string, pageTitlePlain: string): string {
  const want = pageTitlePlain.trim().toLowerCase().replace(/\s+/g, " ");
  if (!want) return html;
  const m = html.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!m) return html;
  const inner = decodeHTMLEntities(
    m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
    .toLowerCase()
    .trim();
  if (inner === want) {
    return html.slice(m[0].length);
  }
  return html;
}

export async function generateMetadata(): Promise<Metadata> {
  let wpPage: Awaited<ReturnType<typeof fetchPageBySlug>> = null;
  try {
    wpPage = await fetchPageBySlug(HUB_WP_SLUG);
  } catch (err) {
    console.error("[our-nursing-services] generateMetadata: fetch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const heading = decodeHTMLEntities(
    wpPage?.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Our Nursing Services"
  );
  const siteOrigin = getPublicSiteOrigin();
  const path = "/our-nursing-services";
  const absoluteUrl = siteOrigin ? `${siteOrigin}${path}` : undefined;
  return {
    title: `${heading} | Joya Medical Supplies`,
    description: "Professional nursing services including wound management and stoma care at home.",
    ...(absoluteUrl ? { alternates: { canonical: absoluteUrl } } : { alternates: { canonical: path } }),
  };
}

export default async function OurNursingServicesPage() {
  const wpPage = await fetchPageBySlug(HUB_WP_SLUG);
  if (!wpPage) {
    console.error("CMS page not found:", HUB_WP_SLUG);
    return <CmsPageFallback slug={HUB_WP_SLUG} breadcrumbLabel="Our Nursing Services" />;
  }

  const serviceCards = await getOurNursingServicesCards();
  const nursingDetailSlugs = await getOurNursingServiceDetailSlugs();

  const heading = decodeHTMLEntities(
    wpPage.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Our Nursing Services"
  );

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Nursing", href: "/nursing" },
    { label: heading },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-white">
        <section className="border-b border-gray-100 bg-white">
          <div className="container mx-auto px-4 py-8 sm:px-6 md:px-8">
            <nav className="mb-6 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <PrefetchLink href="/nursing" className="hover:text-teal-600 transition-colors">
                    Nursing
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="font-medium text-gray-900">{heading}</li>
              </ol>
            </nav>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {heading}
            </h1>
          </div>
        </section>

        <section className="container mx-auto px-4 py-10 sm:px-6 md:px-8 md:py-14">
          {serviceCards.length > 0 ? (
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-10 lg:gap-12">
              {serviceCards.map((svc) => (
                <NursingServiceCard
                  key={svc.slug}
                  title={svc.title}
                  description={svc.description}
                  image={svc.image}
                  href={`/our-nursing-services/${svc.slug}`}
                />
              ))}
            </div>
          ) : (
            <div
              className="nursing-page-content nursing-services-hub-cms mx-auto max-w-5xl"
              dangerouslySetInnerHTML={{
                __html: rewriteNursingHubLinksToNext(
                  sanitizeWordPressPageHTML(
                    stripLeadingDuplicateH1(wpPage.content?.rendered || "", heading)
                  ),
                  nursingDetailSlugs
                ),
              }}
            />
          )}
        </section>
      </div>
    </>
  );
}
