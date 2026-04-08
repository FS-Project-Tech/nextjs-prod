import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import PWARegister from "@/components/PWARegister";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NavigationProgress from "@/components/NavigationProgress";
import MainContent from "@/components/MainContent";
import CoreProviders from "@/components/CoreProviders";
import CommerceProviders from "@/components/CommerceProviders";
import { grift } from "@/lib/fonts";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import TawkToWidget from "@/components/TawkToWidget";
import AnalyticsInitializer from "@/components/AnalyticsInitializer";
import AnalyticsTracker from "@/components/AnalyticsTracker";


// Validate environment variables at startup (server-side only)
if (typeof window === "undefined") {
  try {
    const { validateStartup } = require("@/lib/startup-validation");
    validateStartup();
  } catch (error) {
    // In production, this will prevent startup
    // In development, it will log a warning
    console.error("Startup validation failed:", error);
  }
}
const Header = dynamic(() => import("@/components/Header"));
const Footer = dynamic(() => import("@/components/Footer"), {
  loading: () => <div className="h-40" />,
});
const BottomNav = dynamic(() => import("@/components/BottomNav"));
const CategoriesNav = dynamic(() => import("@/components/CategoriesNav"));
// const AnalyticsInitializer = dynamic(
//   () => import("@/components/AnalyticsInitializer"),
//   { ssr: false }
// );

// Dynamically import MiniCartDrawer - only loaded when cart opens
// This reduces initial bundle size by ~100-150KB on every page
// Note: MiniCartDrawer is a client component, so it will hydrate on the client
const MiniCartDrawer = dynamic(() => import("@/components/MiniCartDrawer"), {
  // No ssr: false needed - component will render empty on server and hydrate on client
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_ID?.trim() || "";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "WooCommerce Headless Store",
    template: "%s | WooCommerce Store",
  },
  description:
    "A modern headless e-commerce solution with Next.js and WooCommerce. Shop the latest products with fast, secure checkout.",
  keywords: ["e-commerce", "woocommerce", "online store", "shopping", "headless commerce"],
  authors: [{ name: "WooCommerce Store" }],
  creator: "WooCommerce Store",
  publisher: "WooCommerce Store",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "WooCommerce Store",
    title: "WooCommerce Headless Store",
    description: "A modern headless e-commerce solution with Next.js and WooCommerce",
    images: [
      {
        url: `${siteUrl}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "WooCommerce Store",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WooCommerce Headless Store",
    description: "A modern headless e-commerce solution with Next.js and WooCommerce",
    images: [`${siteUrl}/og-image.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    // Add your verification codes here
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
    // yahoo: "your-yahoo-verification-code",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${grift.variable} color-scheme-light`}
    >
      <body
        suppressHydrationWarning
        className={`${grift.className} min-h-screen antialiased text-base font-normal leading-normal text-gray-900`}
      >
        {/* Remove browser extension attributes before React hydrates */}
        {/* <Script src="/remove-extension-attributes.js" strategy="beforeInteractive" /> */}

        {ga4MeasurementId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ga4MeasurementId)},{send_page_view:false});`}
            </Script>
          </>
        ) : null}

        <NavigationProgress />
        <SpeedInsights />
        <Analytics />
        <ErrorBoundary>
          <CoreProviders>
            <AnalyticsInitializer />
            <Suspense fallback={null}>
              <AnalyticsTracker />
            </Suspense>
            <CommerceProviders>
              

              <div className="app-shell">
                <div className="sticky top-0 z-50 bg-white shadow-sm">
                  <Header />
                  <CategoriesNav />
                </div>

                <main className="flex-1 pb-20 md:pb-24 lg:pb-0" suppressHydrationWarning>
                  <MainContent>{children}</MainContent>
                </main>

                <Footer />
                <MiniCartDrawer />
                <BottomNav />
                <PWARegister />
                <TawkToWidget />
              </div>
            </CommerceProviders>
          </CoreProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
