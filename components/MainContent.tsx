"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps page content: uses container for most routes. Home (`/`) and `/ndis` are full-width so the
 * hero can span the main column; sections below use their own `Container` / `container`.
 */
function MainContentInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNdis = pathname === "/ndis";
  const isHome = pathname === "/";

  if (isNdis || isHome) {
    return <>{children}</>;
  }
  return <div className="container mx-auto px-3 sm:px-4 md:px-5 lg:px-0">{children}</div>;
}

export default function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-3 sm:px-4 md:px-5 lg:px-0">{children}</div>
      }
    >
      <MainContentInner>{children}</MainContentInner>
    </Suspense>
  );
}
