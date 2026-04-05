import type { Metadata } from "next";
import Link from "next/link";
import { RESOURCE_ITEMS } from "@/lib/resources-data";
import PrefetchLink from "@/components/PrefetchLink";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Guides, product selection help, and care information for continence care, wound care, nutrition, and more.",
  openGraph: { title: "Resources | Joya Medical Supplies" },
  alternates: { canonical: "/resources" },
};

const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Resources" }];

export default function ResourcesPage() {
  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-8 sm:px-6 md:px-8">
            <nav className="mb-4 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden className="select-none">
                  /
                </li>
                <li className="text-gray-900 font-medium">Resources</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Resources
            </h1>
            <p className="mt-2 text-gray-600 max-w-2xl">
              Guides, product selection help, and care information. Choose a topic below.
            </p>
          </div>
        </div>

        {/* Resource list - unique card design: left accent bar + content */}
        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RESOURCE_ITEMS.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/resources/${item.slug}`}
                  className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  <span
                    className="flex h-12 w-1 shrink-0 rounded-full bg-teal-500 transition-all group-hover:bg-teal-600 group-hover:w-1.5"
                    aria-hidden
                  />
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-700 transition-colors group-hover:bg-teal-100">
                    {item.title.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1 text-left font-medium text-gray-900 group-hover:text-teal-700">
                    {item.title}
                  </span>
                  <svg
                    className="h-5 w-5 shrink-0 text-gray-600 transition-transform group-hover:translate-x-1 group-hover:text-teal-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
