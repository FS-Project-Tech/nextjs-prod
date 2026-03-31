/**
 * Brand detail page loading – matches layout (breadcrumb, H1, grid).
 */
export default function BrandSlugLoading() {
  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="mb-6 h-4 w-64 rounded bg-gray-200" />
          <div className="mt-6 h-9 w-48 rounded bg-gray-200" />
          <div className="mt-4 h-1 w-20 rounded-full bg-gray-200" />
          <div className="mt-8 flex gap-6">
            <div className="hidden w-64 shrink-0 lg:block">
              <div className="h-96 rounded-lg bg-gray-200" />
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="aspect-square rounded-lg bg-gray-200" />
                    <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
                    <div className="mt-2 h-4 w-1/2 rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
