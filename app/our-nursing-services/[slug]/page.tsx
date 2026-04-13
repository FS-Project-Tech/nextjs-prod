import type { Metadata } from "next";
import PrefetchLink from "@/components/PrefetchLink";
import CmsPageFallback from "@/components/CmsPageFallback";
import { sanitizeWordPressPageHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchNursingServicePageForUrl } from "@/lib/our-nursing-services-cards";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Allow new WP child pages without a fixed build-time list */
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let page: Awaited<ReturnType<typeof fetchNursingServicePageForUrl>> = null;
  try {
    page = await fetchNursingServicePageForUrl(slug);
  } catch (err) {
    console.error("[our-nursing-services/[slug]] generateMetadata: fetch failed", {
      slug,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const titleText = page
    ? decodeHTMLEntities(page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || slug)
    : slug;
  const description = page?.excerpt?.rendered?.replace(/<[^>]+>/g, "").trim() || undefined;

  return {
    title: `${titleText} | Joya Medical Supplies`,
    description,
    alternates: { canonical: `/our-nursing-services/${slug}` },
  };
}

export default async function NursingServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const page = await fetchNursingServicePageForUrl(slug);

  if (!page) {
    console.error("CMS page not found:", slug);
    return <CmsPageFallback slug={slug} breadcrumbLabel={slug} />;
  }

  const title = decodeHTMLEntities(page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || slug);
  const content = page.content?.rendered || "";

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Nursing", href: "/nursing" },
    { label: "Our Nursing Services", href: "/our-nursing-services" },
    { label: title },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-white">
        <section className="border-b border-gray-100">
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
                <li>
                  <PrefetchLink
                    href="/our-nursing-services"
                    className="hover:text-teal-600 transition-colors"
                  >
                    Our Nursing Services
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="font-medium text-gray-900">{title}</li>
              </ol>
            </nav>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{title}</h1>
          </div>
        </section>

        <section className="container mx-auto px-4 py-10 sm:px-6 md:px-8 md:py-12">
          <div
            className="nursing-page-content mx-auto max-w-8xl"
            dangerouslySetInnerHTML={{
              __html: sanitizeWordPressPageHTML(content),
            }}
          />
          <div className="mx-auto mt-10 max-w-4xl">
            <PrefetchLink
              href="/our-nursing-services"
              className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-700"
            >
              ← Back to Our Nursing Services
            </PrefetchLink>
          </div>
        </section>
      </div>
    </>
  );
}
