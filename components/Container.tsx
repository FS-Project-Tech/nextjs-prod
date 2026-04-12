import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  suppressHydrationWarning?: boolean;
}

/**
 * Site width follows global `.container` in `app/globals.css`: full width on small
 * screens; from 1024px up, 90% width (5% gutter each side) with `mx-auto`.
 */
export default function Container({
  children,
  className = "",
  suppressHydrationWarning = false,
}: ContainerProps) {
  return (
    <div
      className={`container mx-auto ${className}`}
      suppressHydrationWarning={suppressHydrationWarning}
    >
      {children}
    </div>
  );
}
