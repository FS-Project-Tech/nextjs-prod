"use client";

import { useEffect } from "react";
import { initGA4, initMetaPixel } from "@/lib/analytics";

/**
 * GA4 loads via `next/script` in root layout when NEXT_PUBLIC_GA4_ID is set.
 * initGA4 here is only a fallback if gtag is missing (e.g. env added client-only).
 */
export default function AnalyticsInitializer() {
  useEffect(() => {
    const gaId = process.env.NEXT_PUBLIC_GA4_ID?.trim();
    if (gaId && typeof window !== "undefined" && !window.gtag) {
      initGA4(gaId);
    }

    // Initialize Meta Pixel
    if (process.env.NEXT_PUBLIC_META_PIXEL_ID) {
      initMetaPixel(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    }
  }, []);

  return null; // This component doesn't render anything
}
