/**
 * Loading fallback for dynamic product routes.
 * Layout matches product page (breadcrumb + 5-col: gallery, detail, sidebar) for a smooth transition.
 */
export default function ProductLoading() {
  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          {/* Breadcrumb */}
          <div className="mb-6 h-4 w-48 rounded bg-gray-200" />
          {/* Main: gallery (2) + detail (2) + sidebar (1) */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-10">
            {/* Gallery skeleton */}
            <div className="aspect-square rounded-xl bg-gray-200 lg:col-span-2" />
            {/* Detail skeleton */}
            <div className="space-y-4 lg:col-span-2">
              <div className="h-7 rounded bg-gray-200 w-3/4" />
              <div className="h-5 rounded bg-gray-200 w-1/2" />
              <div className="h-10 rounded bg-gray-200 w-24" />
              <div className="h-4 rounded bg-gray-200 w-full" />
              <div className="h-4 rounded bg-gray-200 w-5/6" />
              <div className="h-12 rounded-xl bg-gray-200 w-full" />
            </div>
            {/* Sidebar skeleton */}
            <div
              className="hidden rounded-xl bg-gray-200 lg:block lg:col-span-1"
              style={{ minHeight: 320 }}
            />
          </div>
          {/* Feature cards row */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-200" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
