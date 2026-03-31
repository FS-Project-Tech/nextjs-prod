/**
 * Cart page loading.
 */
export default function CartLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-12">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600"
        aria-hidden
      />
      <p className="text-sm text-gray-500">Loading cart…</p>
    </div>
  );
}
