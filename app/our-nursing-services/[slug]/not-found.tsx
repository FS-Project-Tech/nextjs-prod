import Link from "next/link";

export default function NursingServiceNotFound() {
  return (
    <div className="min-h-[50vh] bg-white">
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm font-medium text-gray-500">404</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Nursing service page not found</h1>
        <p className="mt-4 text-left text-sm text-gray-600">
          Next.js could not load this page from WordPress. Check:
        </p>
        <ul className="mt-3 list-disc pl-5 text-left text-sm text-gray-600">
          <li>
            <strong>WordPress URL</strong> — set{" "}
            <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_WP_URL</code> in{" "}
            <code className="rounded bg-gray-100 px-1">.env.local</code>, or ensure{" "}
            <code className="rounded bg-gray-100 px-1">WC_API_URL</code> points at your WordPress
            site (same host as the REST API).
          </li>
          <li>
            <strong>Published page</strong> — a WordPress <strong>Page</strong> exists with the same
            slug as this URL (e.g.{" "}
            <code className="rounded bg-gray-100 px-1">wound-management</code>), status{" "}
            <strong>Published</strong>.
          </li>
          <li>
            <strong>REST API</strong> — open in a browser:{" "}
            <code className="break-all rounded bg-gray-100 px-1 text-xs">
              {process.env.NEXT_PUBLIC_WP_URL}/wp-json/wp/v2/pages?slug=wound-management
            </code>{" "}
            — you should see JSON with the page, not an empty array{" "}
            <code className="rounded bg-gray-100 px-1">[]</code>.
          </li>
        </ul>
        <Link
          href="/our-nursing-services"
          className="mt-8 inline-block text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          ← Back to Our Nursing Services
        </Link>
      </div>
    </div>
  );
}
