export default function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse grid grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-1"
        >
          <div className="aspect-square rounded-lg bg-gray-200" />
          <div className="min-w-0 space-y-2">
            <div className="h-4 rounded bg-gray-200" />
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
