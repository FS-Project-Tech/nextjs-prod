import ProductGridSkeleton from "./ProductGridSkeleton";

export default function ProductsPageSkeleton() {
  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse"></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <ProductGridSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
