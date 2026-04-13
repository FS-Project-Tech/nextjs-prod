import Link from "next/link";

/**
 * Custom 404 — static only (no async, no fetch) so prerender/`next build` never fails on /_not-found.
 * Shell still comes from `app/layout.tsx`.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm font-medium text-gray-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-3 text-gray-600">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
      >
        Back to home
      </Link>
    </div>
  );
}
