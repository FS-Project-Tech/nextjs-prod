export default function CatalogueCategoryLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="h-8 w-56 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="h-5 w-72 bg-gray-100 rounded animate-pulse mb-8" />
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="aspect-square bg-gray-200 animate-pulse" />
            <div className="p-3">
              <div className="h-5 bg-gray-200 rounded animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
