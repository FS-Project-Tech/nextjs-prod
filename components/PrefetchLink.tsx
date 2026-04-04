"use client";

import Link, { LinkProps } from "next/link";
import { ReactNode, useMemo } from "react";

/**
 * PrefetchLink - Enhanced Link component with optimized prefetching
 *
 * Automatically enables prefetching for critical navigation paths.
 * For dynamic routes, includes fallback handling.
 *
 * Usage:
 *   <PrefetchLink href="/shop">Shop</PrefetchLink>
 *   <PrefetchLink href="/product/[slug]" prefetch={true}>Product</PrefetchLink>
 */
export interface PrefetchLinkProps
  extends LinkProps, Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  children: ReactNode;
  className?: string;
  /**
   * Enable prefetching (default: true for static routes, false for dynamic routes)
   * Set to true explicitly for critical dynamic routes
   */
  prefetch?: boolean;
  /**
   * Whether this is a critical path link (always prefetched if true)
   */
  critical?: boolean;
}

export default function PrefetchLink({
  children,
  href,
  prefetch,
  critical = false,
  ...props
}: PrefetchLinkProps) {
  // Determine prefetch strategy
  const shouldPrefetch = useMemo(() => {
    // If explicitly set, use that value
    if (prefetch !== undefined) {
      return prefetch;
    }

    // Critical paths always prefetch
    if (critical) {
      return true;
    }

    // For dynamic routes (containing [ or [[), default to false unless critical
    const hrefString = typeof href === "string" ? href : href.pathname || "";
    const isDynamicRoute = hrefString.includes("[") || hrefString.includes("[[");

    if (isDynamicRoute) {
      return false; // Dynamic routes need explicit prefetch={true}
    }

    // Static routes default to true (Next.js default behavior)
    return true;
  }, [prefetch, critical, href]);

  return (
    <Link href={href} prefetch={shouldPrefetch} {...props}>
      {children}
    </Link>
  );
}
