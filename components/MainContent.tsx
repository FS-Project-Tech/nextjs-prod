"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps page content: uses container for most routes. Home (`/`) and `/ndis` are full-width so the
 * hero can span the main column; sections below use their own `Container` / `container`.
 */
export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNdis = pathname === "/ndis";
  const isHome = pathname === "/";

  if (isNdis || isHome) {
    return <>{children}</>;
  }
  return <div className="container mx-auto px-3 sm:px-4 md:px-5 lg:px-0">{children}</div>;
}
