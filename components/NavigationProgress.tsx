"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Global navigation progress bar.
 * Shows a thin bar at the top when the user clicks a link (same-origin);
 * hides when the route has finished loading (pathname change).
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  // Hide progress when pathname changes (navigation finished)
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setIsNavigating(false);
    }
  }, [pathname]);

  // Listen for link clicks to show progress immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!anchor || !anchor.href) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          setIsNavigating(true);
        }
      } catch {
        // ignore invalid URLs
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  // Fallback: hide progress after 8s in case pathname doesn't change (e.g. same path, different query)
  useEffect(() => {
    if (!isNavigating) return;
    const t = setTimeout(() => setIsNavigating(false), 8000);
    return () => clearTimeout(t);
  }, [isNavigating]);

  if (!isNavigating) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[100] h-1 overflow-hidden bg-teal-100"
      role="progressbar"
      aria-label="Loading"
      aria-valuetext="Loading"
    >
      <div className="h-full w-full origin-left animate-navigation-progress rounded-r-full bg-teal-600" />
    </div>
  );
}
