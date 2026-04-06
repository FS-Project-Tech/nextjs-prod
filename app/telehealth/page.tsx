import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { sanitizeWordPressPageHTML, TelehealthMediaHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { splitTelehealthBody } from "@/lib/telehealth-content";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
 
/** WordPress page slug (create a Page in WP with this slug). */
const WP_PAGE_SLUG = "telehealth";
 
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
 
export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPageBySlug(WP_PAGE_SLUG);
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Telehealth";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const description = rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined;
 
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/telehealth` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl}/telehealth`,
    },
  };
}
 
export default async function TelehealthPage() {
  const page = await fetchPageBySlug(WP_PAGE_SLUG);
  if (!page) {
    notFound();
  }
 
  const rawTitle = page.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Telehealth";
 
  const bodyDecoded = decodeHTMLEntities(page.content?.rendered || "");
  const { copyHtml, mediaHtml } = splitTelehealthBody(bodyDecoded);
 
  const copySafe = sanitizeWordPressPageHTML(copyHtml);
  const mediaSafe = TelehealthMediaHTML(mediaHtml);
 
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];
 
  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
 
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-200 bg-gray-50/80">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <nav className="mb-2 text-sm text-gray-500" aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="text-teal-600 transition-colors hover:text-teal-700">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden className="text-gray-400">
                  /
                </li>
                <li className="font-medium text-gray-900">{title}</li>
              </ol>
            </nav>
          </div>
        </div>
 
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
            {/* Text column */}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{title}</h1>
              <div
                className="telehealth-copy mt-6
                  prose prose-lg max-w-none text-gray-700
                  prose-headings:font-bold prose-headings:text-gray-900
                  prose-p:leading-relaxed prose-p:text-gray-600
                  prose-a:text-teal-600 hover:prose-a:text-teal-700
                  prose-strong:text-gray-900
                  prose-ul:list-disc prose-ul:pl-6 prose-li:marker:text-teal-600"
                dangerouslySetInnerHTML={{
                  __html:
                    copySafe ||
                    (!mediaSafe ? "<p>Content is being updated. Please check back soon.</p>" : ""),
                }}
              />
            </div>
 
            {/* Video / embed column */}
            <div className="min-w-0 lg:sticky lg:top-24">
              {mediaSafe ? (
                <div
                  className="
                    telehealth-media relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 shadow-xl
                    [&_*]:max-w-full
                    [&_.wp-block-embed]:m-0 [&_.wp-block-embed]:h-full [&_.wp-block-embed]:w-full
                    [&_.wp-block-embed__wrapper]:relative [&_.wp-block-embed__wrapper]:h-full [&_.wp-block-embed__wrapper]:min-h-0 [&_.wp-block-embed__wrapper]:w-full
                    [&_video]:h-full [&_video]:w-full [&_video]:object-cover
                    [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0
                  "
                  dangerouslySetInnerHTML={{ __html: mediaSafe }}
                />
              ) : (
                <div className="flex aspect-video min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 text-center text-sm text-gray-500">
                  <div className="max-w-md space-y-2">
                    <p>
                      Add a video in WordPress: put your text first, then add a <strong>YouTube</strong>,{" "}
                      <strong>Embed</strong>, or <strong>Video</strong> block — it will appear here automatically.
                    </p>
                    <p className="text-xs text-gray-400">
                      Optional: use a Custom HTML block with{" "}
                      <code className="rounded bg-gray-200 px-1 py-0.5 text-gray-600">
                        &lt;!-- joya-telehealth-split --&gt;
                      </code>{" "}
                      between text and media.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
 
          <div className="mt-14 border-t border-gray-200 pt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-medium text-teal-600 transition-colors hover:text-teal-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}