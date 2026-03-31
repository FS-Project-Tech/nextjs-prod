/**
 * Brands page loading – grid skeleton.
 */
export default function BrandsLoading() {
  return (
    <div className="min-h-[50vh] py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="mb-6 h-4 w-48 rounded bg-gray-200" />
          <div className="mt-8 h-8 w-56 rounded bg-gray-200" />
          <div className="mt-2 h-5 w-80 rounded bg-gray-200" />
          <div className="mt-4 h-1 w-20 rounded-full bg-gray-200" />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mx-auto h-20 w-20 rounded-full bg-gray-200" />
                <div className="mt-3 h-4 w-3/4 mx-auto rounded bg-gray-200" />
                <div className="mt-2 h-3 w-1/2 mx-auto rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
