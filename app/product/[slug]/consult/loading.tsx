export default function ConsultationLoading() {
  return (
    <div className="min-h-screen py-12 bg-gray-50">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb skeleton */}
        <div className="h-6 bg-gray-200 rounded w-64 mb-8 animate-pulse"></div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
        </div>

        {/* Section skeletons */}
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse"
          >
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

