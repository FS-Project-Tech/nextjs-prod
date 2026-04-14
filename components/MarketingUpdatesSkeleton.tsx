/** Placeholder while `getMarketingUpdates` runs (non-blocking via Suspense). */
export default function MarketingUpdatesSkeleton() {
  return (
    <section className="mb-10 marketing-section" aria-hidden>
      <div className="container mx-auto px-3 sm:px-4 md:px-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[16/10] w-full animate-pulse rounded-xl bg-gray-200"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
