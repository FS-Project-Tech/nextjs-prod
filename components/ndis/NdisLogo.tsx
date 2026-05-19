"use client";

import Image from "next/image";
import { useState } from "react";
import { getNdisLogoUrl } from "@/lib/ndis-branding";

export type NdisLogoProps = {
  /** Override site default (`NEXT_PUBLIC_NDIS_LOGO_URL` or `/ndis-logo.svg`). */
  logoUrl?: string | null;
  width?: number;
  height?: number;
  className?: string;
  /** Shown when the image fails to load. */
  showBadgeFallback?: boolean;
};

function NdisTextBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-violet-700 text-[8px] font-bold uppercase text-white ${className ?? ""}`}
      aria-hidden
    >
      ndis
    </span>
  );
}

export function NdisLogo({
  logoUrl,
  width = 32,
  height = 20,
  className,
  showBadgeFallback = true,
}: NdisLogoProps) {
  const src = getNdisLogoUrl(logoUrl);
  const [failed, setFailed] = useState(false);

  if (failed && showBadgeFallback) {
    return <NdisTextBadge className={className} />;
  }

  return (
    <Image
      src={src}
      alt="NDIS"
      width={width}
      height={height}
      className={`h-5 w-auto shrink-0 object-contain ${className ?? ""}`}
      onError={() => setFailed(true)}
      unoptimized={src.endsWith(".svg")}
    />
  );
}
