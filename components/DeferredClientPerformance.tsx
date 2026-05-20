"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Analytics = dynamic(() => import("@vercel/analytics/next").then((m) => m.Analytics), {
  ssr: false,
});
const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights),
  { ssr: false }
);
const AnalyticsInitializer = dynamic(() => import("@/components/AnalyticsInitializer"), {
  ssr: false,
});
const AnalyticsTracker = dynamic(() => import("@/components/AnalyticsTracker"), {
  ssr: false,
});

function scheduleDeferredAnalytics(cb: () => void) {
  if (typeof window === "undefined") return;
  const run = () => cb();
  const delayed = () => {
    globalThis.setTimeout(run, 3000);
  };
  const w = window;
  if ("requestIdleCallback" in w) {
    w.requestIdleCallback(delayed, { timeout: 5000 });
  } else {
    globalThis.setTimeout(delayed, 0);
  }
}

function buildGtagBootstrapInline(ga4: string, ads: string): string {
  const parts = [
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());",
  ];
  if (ga4) {
    parts.push(`gtag('config',${JSON.stringify(ga4)},{send_page_view:false});`);
  }
  if (ads) {
    parts.push(`gtag('config',${JSON.stringify(ads)});`);
  }
  return parts.join("");
}

/**
 * Loads gtag / GA4 / Ads, Vercel Analytics, Speed Insights, Meta pixel, and SPA tracker
 * after idle + delay so first paint stays light.
 */
export default function DeferredClientPerformance({ nonce }: { nonce: string }) {
  const [ready, setReady] = useState(false);
  const [gtagReady, setGtagReady] = useState(false);

  useEffect(() => {
    scheduleDeferredAnalytics(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || typeof document === "undefined") return;
    const ga4 = process.env.NEXT_PUBLIC_GA4_ID?.trim() || "";
    const ads = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "";
    const gtagScriptId = ga4 || ads;
    if (!gtagScriptId) {
      return;
    }

    const src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagScriptId)}`;
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      const ext = document.createElement("script");
      ext.src = src;
      ext.async = true;
      ext.setAttribute("nonce", nonce);
      document.head.appendChild(ext);
    }

    if (!window.gtag) {
      const inline = document.createElement("script");
      inline.setAttribute("nonce", nonce);
      inline.textContent = buildGtagBootstrapInline(ga4, ads);
      document.head.appendChild(inline);
    }

    const id = globalThis.setTimeout(() => setGtagReady(true), 0);
    return () => globalThis.clearTimeout(id);
  }, [ready, nonce]);

  if (!ready) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
      <AnalyticsInitializer />
      {gtagReady ? (
        <Suspense fallback={null}>
          <AnalyticsTracker />
        </Suspense>
      ) : null}
    </>
  );
}
