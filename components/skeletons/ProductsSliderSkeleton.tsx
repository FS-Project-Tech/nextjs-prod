export interface ProductsSliderSkeletonProps {
  count?: number;
  /** Match grid columns of ProductsSlider (default 5). */
  gridCols?: 4 | 5 | 6;
}

export default function ProductsSliderSkeleton({
  count = 5,
  gridCols = 5,
}: ProductsSliderSkeletonProps) {
  const gridClass =
    gridCols === 6
      ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6"
      : gridCols === 5
        ? "grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-5"
        : "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4";
  return (
    <div className={gridClass}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-[3/4] animate-pulse rounded-xl border border-gray-200 bg-white"
        />
      ))}
    </div>
  );
}
