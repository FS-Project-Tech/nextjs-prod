import { headers } from "next/headers";

const CONTAINER_CLASS = "container mx-auto px-3 sm:px-4 md:px-5 lg:px-0";

/**
 * Wraps page content: container for most routes. Home (`/`) and `/ndis` are full-width so heroes
 * can span the main column. Path comes from middleware (`x-pathname`) so this stays a server
 * component — no client hydration for the shell wrapper.
 */
export default async function MainContent({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const fullWidth = pathname === "/" || pathname === "/ndis";

  if (fullWidth) {
    return <>{children}</>;
  }
  return <div className={CONTAINER_CLASS}>{children}</div>;
}
