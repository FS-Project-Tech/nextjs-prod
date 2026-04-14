export function ProductMainColumnSkeleton() {
  return (
    <>
      <div className="lg:col-span-2">
        <div className="aspect-square w-full animate-pulse rounded-xl bg-gray-200" />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="h-9 max-w-md animate-pulse rounded-md bg-gray-200" />
        <div className="h-6 max-w-xs animate-pulse rounded-md bg-gray-100" />
        <div className="flex flex-wrap gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="h-28 w-full animate-pulse rounded-lg bg-gray-100" />
        <div className="flex gap-3 pt-2">
          <div className="h-12 max-w-[200px] flex-1 animate-pulse rounded-xl bg-gray-200" />
        </div>
      </div>
    </>
  );
}

export function ProductSidebarSkeleton() {
  return (
    <aside className="flex flex-col gap-6 lg:col-span-1" aria-hidden>
      <div className="h-[600px] w-full animate-pulse rounded-xl bg-gray-200" />
      <div className="h-[200px] w-full animate-pulse rounded-xl bg-gray-100" />
    </aside>
  );
}

export function ProductAccordionReviewsSkeleton() {
  return (
    <div className="mt-10 space-y-6" aria-hidden>
      <div className="h-48 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-64 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

export function ProductAccordionOnlySkeleton() {
  return (
    <div className="mt-10" aria-hidden>
      <div className="h-48 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

export function ProductReviewsOnlySkeleton() {
  return (
    <div className="mt-10" aria-hidden>
      <div className="h-64 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

export function ProductRelatedSkeleton() {
  return (
    <div className="mt-10 space-y-10" aria-hidden>
      <div className="h-56 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-56 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}
