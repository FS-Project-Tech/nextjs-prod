import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import {
  fetchEventBySlug,
  decodeHTMLEntities,
  resolveEventGalleryImages,
  stripWpBlockGalleriesFromHtml,
} from "@/lib/cms-events";
import { sanitizeWordPressPageHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug);
  if (!event) return { title: "Event" };
  const rawTitle = event.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Event";
  const rawExcerpt =
    event.excerpt?.rendered
      ?.replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 160) || "";
  const description = rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/events/${slug}` },
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug);
  if (!event) notFound();

  const rawTitle = event.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Untitled";
  const rawContent = event.content?.rendered || "";
  const galleryImages = await resolveEventGalleryImages(event, rawContent);

  /* Avoid duplicate gallery: same images go to Photos + strip from body */
  const content = stripWpBlockGalleriesFromHtml(rawContent);

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Events", href: "/events" },
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
                  <PrefetchLink href="/events" className="hover:text-teal-600 transition-colors">
                    Events
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">{title}</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
            <time className="mt-2 block text-sm text-gray-500" dateTime={event.date}>
              {new Date(event.date).toLocaleDateString("en-AU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="mx-auto max-w-8xl rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <div
              className="info-content info-content--events"
              dangerouslySetInnerHTML={{
                __html: sanitizeWordPressPageHTML(content),
              }}
            />

            {galleryImages.length > 0 && (
              <section
                className="event-gallery mt-10 border-t border-gray-100 pt-10"
                aria-label="Event photos"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Photos</h2>
                <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-5">
                  {galleryImages.map((img, idx) => (
                    <div
                      key={`${img.src}-${idx}`}
                      className="relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-100 bg-gray-100"
                    >
                      <img
                        src={img.src}
                        alt={img.alt || `${title} — photo ${idx + 1}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading={idx === 0 ? "eager" : "lazy"}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-8">
              <Link
                href="/events"
                className="inline-flex items-center gap-2 font-medium text-teal-600 hover:text-teal-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Events
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
