"use client";

import { useEffect } from "react";
import { initGA4, initMetaPixel } from "@/lib/analytics";

/**
 * Analytics Initializer Component
 * Initializes Google Analytics 4 and Meta Pixel on client-side
 */
export default function AnalyticsInitializer() {
  useEffect(() => {
    // Initialize Google Analytics 4
    if (process.env.NEXT_PUBLIC_GA4_ID) {
      initGA4(process.env.NEXT_PUBLIC_GA4_ID);
    }

    // Initialize Meta Pixel
    if (process.env.NEXT_PUBLIC_META_PIXEL_ID) {
      initMetaPixel(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    }
  }, []);

  return null; // This component doesn't render anything
}

