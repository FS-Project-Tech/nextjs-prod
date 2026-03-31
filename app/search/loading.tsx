/**
 * Search page loading.
 */
export default function SearchLoading() {
  return (
    <div className="min-h-[40vh] py-8">
      <div className="animate-pulse">
        <div className="mb-4 h-10 w-64 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-lg bg-gray-200" />
              <div className="h-4 w-3/4 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
