/**
 * Root loading fallback – shown when navigating to any page while its segment loads.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600"
        aria-hidden
      />
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  );
}
