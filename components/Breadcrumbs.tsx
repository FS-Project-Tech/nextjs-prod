"use client";

import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const parent = items.length >= 2 ? items[items.length - 2] : null;
  const showMobileBack = Boolean(parent?.href);

  return (
    <nav className="mb-6" aria-label="Breadcrumb">
      {showMobileBack && parent?.href ? (
        <Link
          href={parent.href}
          className="inline-flex max-w-full items-center gap-1 text-sm text-gray-600 underline decoration-gray-400 underline-offset-2 transition-colors hover:text-gray-900 md:hidden"
        >
          <ChevronLeftIcon className="h-4 w-4 shrink-0 text-gray-600" />
          <span className="min-w-0 break-words">
            Back to <span className="text-gray-900">{parent.label}</span>
          </span>
        </Link>
      ) : null}
      <ol
        className={
          showMobileBack
            ? "hidden flex-wrap items-center gap-y-1 text-sm text-gray-600 md:flex"
            : "flex flex-wrap items-center gap-y-1 text-sm text-gray-600"
        }
      >
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 max-w-full items-center">
            {index > 0 && (
              <ChevronRightIcon className="mx-2 h-4 w-4 shrink-0 text-gray-600" />
            )}
            {item.href && index < items.length - 1 ? (
              <Link
                href={item.href}
                className="min-w-0 break-words transition-colors hover:text-gray-900"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  index === items.length - 1
                    ? "min-w-0 break-words font-medium text-gray-900"
                    : "min-w-0 break-words"
                }
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
