import PrefetchLink from "@/components/PrefetchLink";

type Props = {
  /** WordPress or URL slug (for logs / screen readers) */
  slug: string;
  /** Breadcrumb label when CMS title is unknown */
  breadcrumbLabel?: string;
};

/**
 * Shown when WordPress is unreachable or returns no page — avoids notFound() / cached 404 on Vercel.
 */
export default function CmsPageFallback({ slug, breadcrumbLabel }: Props) {
  const crumb = breadcrumbLabel || slug;
  return (
    <div className="min-h-screen bg-white">
      <section className="border-b border-gray-100 bg-white">
        <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                  Home
                </PrefetchLink>
              </li>
              <li aria-hidden>/</li>
              <li className="font-medium text-gray-900">{crumb}</li>
            </ol>
          </nav>
        </div>
      </section>
      <section className="container mx-auto px-4 pb-12 sm:px-6 md:px-8 md:pb-16">
        <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-700">
          <h1 className="text-xl font-semibold text-gray-900">Content not available</h1>
          <p className="mt-3 text-sm leading-relaxed">
            We could not load this page from our content system. Please try again in a few minutes.
          </p>
          <PrefetchLink
            href="/"
            className="mt-6 inline-block text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Return to home
          </PrefetchLink>
        </div>
      </section>
    </div>
  );
}
