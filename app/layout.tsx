import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainContent from "@/components/MainContent";
import CoreProviders from "@/components/CoreProviders";
import CommerceProviders from "@/components/CommerceProviders";
import { grift } from "@/lib/fonts";
import "./globals.css";
import DeferredClientPerformance from "@/components/DeferredClientPerformance";
import DeferredTawkToWidget from "@/components/DeferredTawkToWidget";
import { ClientCartNavPWA, ClientNavigationProgress } from "@/components/ClientOnlyShellChunks";
import CategoriesNav, { CategoriesNavSkeleton } from "@/components/CategoriesNav";
import { getPublicHeaderData } from "@/lib/cms/public-header-data";
import ScrollToFooterButton from "@/components/ScrollToFooterButton";
import AccessiBe from "@/components/AccessiBe";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Joya Medical Supplies",
    template: "%s",
  },
  description:
    "Your trusted partner for quality medical supplies and healthcare products. Supporting NDIS participants with premium care solutions.",
  keywords: ["e-commerce", "online store", "shopping", "medical supplies", "healthcare products", "NDIS participants", "premium care solutions"],
  authors: [{ name: "Joya Medical Supplies" }],
  creator: "Joya Medical Supplies",
  publisher: "Joya Medical Supplies",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/images/favicon.png",
    shortcut: "/images/favicon.png",
    apple: "/images/favicon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Joya Medical Supplies",
    title: "Joya Medical Supplies",
    description: "Your trusted partner for quality medical supplies and healthcare products. Supporting NDIS participants with premium care solutions.",
    images: [
      {
        url: `${siteUrl}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "Joya Medical Supplies",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Joya Medical Supplies",
    description: "Your trusted partner for quality medical supplies and healthcare products. Supporting NDIS participants with premium care solutions.",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headerCms = await getPublicHeaderData();
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
        <ClientNavigationProgress />
        <DeferredClientPerformance nonce={nonce} />
        <ErrorBoundary>
          <CoreProviders>
            <CommerceProviders>
              <div className="app-shell">
                <div className="relative z-40 bg-white shadow-sm md:sticky md:top-0 md:z-50">
                  <Header initialCms={headerCms} />
                  <Suspense fallback={<CategoriesNavSkeleton />}>
                    <CategoriesNav />
                  </Suspense>
                </div>

                <main className="flex-1 pb-20 md:pb-24 lg:pb-0">
                  <MainContent>{children}</MainContent>
                </main>

                <Footer />
                <ScrollToFooterButton />
                <ClientCartNavPWA />
                <DeferredTawkToWidget />
              </div>
            </CommerceProviders>
          </CoreProviders>
        </ErrorBoundary>
        <AccessiBe />
      </body>
    </html>
  );
}
