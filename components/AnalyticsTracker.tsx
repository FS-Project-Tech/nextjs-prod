"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

/**
 * Sends GA4 page views on App Router navigations (layout loads gtag with send_page_view: false).
 */
export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams.toString();
    const pagePath = search ? `${pathname}?${search}` : pathname || "/";
    trackPageView(pagePath);
  }, [pathname, searchParams]);

  return null;
}
