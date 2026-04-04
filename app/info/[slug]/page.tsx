import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { sanitizeHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

/** Map URL slugs to WordPress page slugs */
const SLUG_TO_WP: Record<string, string> = {
  privacy: "privacy-policy",
  terms: "term-conditions",
  faq: "faqs",
  shipping: "shipping",
  "collection-statement": "collection-statement-general-enquiries",
};

const SLUG_TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  faq: "FAQ",
  shipping: "Shipping & Returns",
  "collection-statement": "Collection Statement",
};

const VALID_SLUGS = Object.keys(SLUG_TO_WP);

/** Decode HTML entities (e.g. &#8211; → –, &amp; → &) */
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wpSlug = SLUG_TO_WP[slug];
  if (!wpSlug) return { title: "Page" };

  const page = await fetchPageBySlug(wpSlug);
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : SLUG_TITLES[slug] || slug;
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const excerpt = rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
  return {
    title,
    description: excerpt,
    alternates: { canonical: `${siteUrl}/info/${slug}` },
    openGraph: {
      title,
      description: excerpt,
      type: "website",
      url: `${siteUrl}/info/${slug}`,
    },
  };
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const wpSlug = SLUG_TO_WP[slug];

  if (!wpSlug || !VALID_SLUGS.includes(slug)) {
    notFound();
  }

  const page = await fetchPageBySlug(wpSlug);
  if (!page) {
    notFound();
  }

  const rawTitle = page.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : SLUG_TITLES[slug] || slug;

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />

      <div className="min-h-screen bg-gray-50">
        {/* HEADER */}
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8">
            {/* Breadcrumb */}
            <nav className="mb-3 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">{title}</li>
              </ol>
            </nav>

            {/* Page Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
          </div>
        </div>

        {/* CONTENT */}
        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="mx-auto max-w-8xl  rounded-2xl border border-gray-200 bg-white p-6 sm:p-10 shadow-sm">
            {/* WordPress Content */}
            <div
              className="
                prose prose-lg max-w-none info-page-content
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

            {/* Back Button */}
            <div className="mt-10 pt-6 border-t border-gray-200">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-teal-600 font-medium hover:text-teal-700 transition-colors"
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
