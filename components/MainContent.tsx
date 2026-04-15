"use client";

import { usePathname } from "next/navigation";

const CONTAINER_CLASS = "container mx-auto px-3 sm:px-4 md:px-5 lg:px-0";

/**
 * Wraps page content: container for most routes. Home (`/`) and `/ndis` are full-width so heroes
 * can span the main column.
 */
export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const fullWidth = pathname === "/" || pathname === "/ndis";

  if (fullWidth) {
    return <>{children}</>;
  }
  return <div className={CONTAINER_CLASS}>{children}</div>;
}
