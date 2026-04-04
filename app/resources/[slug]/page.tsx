import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { RESOURCE_ITEMS, getResourceBySlug } from "@/lib/resources-data";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return RESOURCE_ITEMS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resource = getResourceBySlug(slug);
  if (!resource) return { title: "Resource Not Found" };
  return {
    title: `${resource.title} | Resources`,
    description: `Guides and information for ${resource.title}.`,
    alternates: { canonical: `/resources/${slug}` },
  };
}

/**
 * Detail content can be fetched from WordPress backend here when ready.
 * e.g. fetch by slug: /wp-json/wp/v2/resource?slug=continence-care
 * or custom post type / ACF. For now we render a placeholder.
 */
export default async function ResourceDetailPage({ params }: Props) {
  const { slug } = await params;
  const resource = getResourceBySlug(slug);
  if (!resource) notFound();

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources" },
    { label: resource.title },
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
                <li aria-hidden className="select-none">
                  /
                </li>
                <li>
                  <Link href="/resources" className="hover:text-teal-600 transition-colors">
                    Resources
                  </Link>
                </li>
                <li aria-hidden className="select-none">
                  /
                </li>
                <li className="text-gray-900 font-medium">{resource.title}</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{resource.title}</h1>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            {/* Placeholder: replace with content from WordPress when backend is ready */}
            <p className="text-gray-600">
              Content for <strong>{resource.title}</strong> will be loaded from the backend. Add
              this resource in WordPress and we can fetch it here by slug:{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">{slug}</code>.
            </p>
            <div className="mt-6">
              <Link
                href="/resources"
                className="inline-flex items-center gap-2 text-teal-600 font-medium hover:text-teal-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Resources
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
