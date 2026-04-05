import type { Metadata } from "next";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchEvents, decodeHTMLEntities } from "@/lib/cms-events";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming and past events from Joya Medical Supplies — workshops, expos, and community updates.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPage = 12;

  const { events, totalPages, meta } = await fetchEvents({
    per: perPage,
    page: pageNum,
  });

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Events" }];

  function buildPageUrl(p: number) {
    return p <= 1 ? "/events" : `/events?page=${p}`;
  }

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
                <li className="text-gray-900 font-medium">Events</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Events</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 sm:text-base">
              Stay informed about our latest events, trade shows, and community activities.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="mx-auto max-w-8xl">
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => {
                const rawTitle =
                  event.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Untitled";
                const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Untitled";
                const img = event._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
                const dateLabel = new Date(event.date).toLocaleDateString("en-AU", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
                return (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-teal-300 hover:shadow-md"
                    >
                      {/* object-contain = full image visible (may letterbox); object-cover crops to fill */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain object-center transition-opacity duration-300 group-hover:opacity-95"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3 sm:p-4">
                        <h2 className="text-sm font-semibold leading-snug text-teal-800 group-hover:text-teal-600 sm:text-base line-clamp-3">
                          {title}
                        </h2>
                        <time className="mt-2 text-xs text-gray-500" dateTime={event.date}>
                          {dateLabel}
                        </time>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mx-auto max-w-5xl">
            {totalPages > 1 && (
              <nav
                className="mt-10 flex flex-wrap items-center justify-center gap-2"
                aria-label="Events pagination"
              >
                {pageNum > 1 && (
                  <Link
                    href={buildPageUrl(pageNum - 1)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    ← Previous
                  </Link>
                )}
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={buildPageUrl(p)}
                      className={`min-w-[2.5rem] rounded-lg px-3 py-2 text-center text-sm font-medium ${
                        p === pageNum
                          ? "bg-teal-600 text-white"
                          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </Link>
                  ))}
                </div>
                {pageNum < totalPages && (
                  <Link
                    href={buildPageUrl(pageNum + 1)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Next →
                  </Link>
                )}
              </nav>
            )}
          </div>

          {events.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600 space-y-3">
              {!process.env.NEXT_PUBLIC_WP_URL ? (
                <p>
                  Events feed is not configured. Add{" "}
                  <code className="rounded bg-gray-100 px-1 text-sm">NEXT_PUBLIC_WP_URL</code> to
                  your environment.
                </p>
              ) : !meta.apiOk ? (
                <p>
                  Could not load events from WordPress. Check that your events post type is public
                  and has <code className="rounded bg-gray-100 px-1 text-sm">show_in_rest</code>{" "}
                  enabled, or set{" "}
                  <code className="rounded bg-gray-100 px-1 text-sm">
                    NEXT_PUBLIC_WP_EVENTS_REST_BASE
                  </code>{" "}
                  to your CPT REST base (tried automatically: events, event, tribe_events).
                </p>
              ) : (
                <p>There are no published events to show yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
