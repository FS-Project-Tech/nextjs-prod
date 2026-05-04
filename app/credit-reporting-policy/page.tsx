import type { Metadata } from "next";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import CmsPageFallback from "@/components/CmsPageFallback";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { getPublicSiteOrigin } from "@/lib/cms-seo";
import { decodeHTMLEntities, sanitizeHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const dynamic = "force-dynamic";

/** WordPress page slug (Pages → Credit Reporting Policy) */
const WP_SLUG = "credit-reporting-policy";

const FETCH_POLICY = { revalidate: 3600 } as const;

export async function generateMetadata(): Promise<Metadata> {
  let page: Awaited<ReturnType<typeof fetchPageBySlug>> = null;
  try {
    page = await fetchPageBySlug(WP_SLUG, FETCH_POLICY);
  } catch (err) {
    console.error("[credit-reporting-policy] generateMetadata: fetch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle
    ? decodeHTMLEntities(rawTitle)
    : "Credit Reporting Policy";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const siteOrigin = getPublicSiteOrigin();
  const path = "/credit-reporting-policy";
  const absoluteUrl = siteOrigin ? `${siteOrigin}${path}` : undefined;
  return {
    title: `${title} | Joya Medical Supplies`,
    description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
    ...(absoluteUrl
      ? {
          alternates: { canonical: absoluteUrl },
          openGraph: {
            title,
            description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
            type: "website",
            url: absoluteUrl,
          },
        }
      : {
          openGraph: {
            title,
            description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
            type: "website",
          },
        }),
  };
}

export default async function CreditReportingPolicyPage() {
  const page = await fetchPageBySlug(WP_SLUG, FETCH_POLICY);
  if (!page) {
    console.error("CMS page not found:", WP_SLUG);
    return <CmsPageFallback slug={WP_SLUG} breadcrumbLabel="Credit Reporting Policy" />;
  }

  const rawTitle = page.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Credit Reporting Policy";

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />

      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8">
            <nav className="mb-3 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="transition-colors hover:text-teal-600">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="font-medium text-gray-900">{title}</li>
              </ol>
            </nav>

            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="mx-auto max-w-8xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
            <div
              className="
                info-page-content prose prose-lg max-w-none
                prose-headings:font-bold
                prose-h1:text-3xl
                prose-h2:text-2xl
                prose-h3:text-xl
                prose-p:text-gray-700
                prose-a:text-teal-600 hover:prose-a:text-teal-700
                prose-strong:text-gray-900
                prose-ul:list-disc prose-ul:pl-6
                prose-ol:list-decimal prose-ol:pl-6
                prose-li:mb-1
                prose-table:w-full prose-table:border
                prose-th:border prose-th:bg-gray-100 prose-th:p-2
                prose-td:border prose-td:p-2
              "
              dangerouslySetInnerHTML={{
                __html: sanitizeHTML(decodeHTMLEntities(page.content?.rendered || "")),
              }}
            />

            <div className="mt-10 border-t border-gray-200 pt-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 font-medium text-teal-600 transition-colors hover:text-teal-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
