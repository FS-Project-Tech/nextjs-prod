/** Placeholder while `ProductDetailPanel` chunk loads (smaller initial JS for product routes). */
export default function ProductDetailPanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="h-9 max-w-md rounded-md bg-gray-200" />
      <div className="h-6 max-w-xs rounded-md bg-gray-100" />
      <div className="flex flex-wrap gap-2">
        <div className="h-10 w-24 rounded-lg bg-gray-100" />
        <div className="h-10 w-24 rounded-lg bg-gray-100" />
        <div className="h-10 w-24 rounded-lg bg-gray-100" />
      </div>
      <div className="h-28 w-full rounded-lg bg-gray-100" />
      <div className="flex gap-3 pt-2">
        <div className="h-12 flex-1 max-w-[200px] rounded-xl bg-gray-200" />
        <div className="h-12 w-12 rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}
