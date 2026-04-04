import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPostBySlug } from "@/lib/cms-posts";
import { sanitizeHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const dynamicParams = true;

const SLUG_TO_TITLE: Record<string, string> = {
  caps: "Continence Aids Payment Scheme (CAPS)",
  "my-aged-care": "My Aged Care (Home Care Packages)",
  ndis: "National Disability Insurance Scheme (NDIS)",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) return { title: "Funding Scheme" };
  const rawTitle = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : SLUG_TO_TITLE[slug] || slug;
  const rawExcerpt =
    post.excerpt?.rendered
      ?.replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 160) || "";
  const description = rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined;
  return {
    title: `${title} | Funding Schemes`,
    description,
    alternates: { canonical: `/funding-scheme/${slug}` },
  };
}

export default async function FundingSchemeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  const rawTitle = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : SLUG_TO_TITLE[slug] || slug;
  const content = post.content?.rendered || "";

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Funding Schemes", href: "/funding-scheme" },
    { label: title },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8">
            <nav className="mb-3 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <PrefetchLink
                    href="/funding-scheme"
                    className="hover:text-teal-600 transition-colors"
                  >
                    Funding Schemes
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">{title}</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div
            className="funding-scheme-content funding-scheme-detail mx-auto max-w-8xl rounded-xl border border-gray-200 bg-white p-6 sm:p-8"
            dangerouslySetInnerHTML={{
              __html: sanitizeHTML(decodeHTMLEntities(content)),
            }}
          />
          <div className="mt-8">
            <Link
              href="/funding-scheme"
              className="inline-flex gap-2 text-teal-600 font-medium hover:text-teal-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Funding Schemes
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
