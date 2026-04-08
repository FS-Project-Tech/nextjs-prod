import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { WebsiteStructuredData, OrganizationStructuredData } from "@/components/StructuredData";
import HeroDualSliderServer from "@/components/HeroDualSliderServer";

// ============================================================================
// ISR Configuration - Revalidate homepage every 5 minutes
// ============================================================================
export const revalidate = 300; // 5 minutes

// SEO Metadata for homepage
export const metadata: Metadata = {
  title: "Wholesale Medical Supplies & Equipment Online in Gold Coast, Australia",
  description:
    "Joya Medical Supplies is your most trusted local supplier of a wide range of wholesale medical supplies, equipment & hospital products in Gold Coast, Queensland, Australia.",
  openGraph: {
    title: "JOYA Medical Supplies - Shop Latest Products",
    description:
      "Shop the latest products at our JOYA Medical Supplies store. Fast, secure checkout with free shipping.",
    type: "website",
  },
  alternates: {
    canonical: "/",
  },
};

// Import ProductsPageClientWrapper - client component wrapper that handles dynamic import
// import ProductsPageClientWrapper from "@/components/ProductsPageClientWrapper";
//  import { bgGradient } from "tailwindcss/defaultTheme";
import ProductSection from "@/components/ProductSection";
import CategoriesSection from "@/components/CategoriesSection";
import MarketingUpdatesSection from "@/components/MarketingUpdatesSection";
import NDISCTASection from "@/components/NDISCTASection";
import TrendingSection from "@/components/TrendingSection";
import NewsletterSection from "@/components/NewsletterSection";
import AnimatedSection from "@/components/AnimatedSection";
import HomePageClient from "@/components/HomePageClient";
import FeatureStrip from "@/components/FeaturedSection";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ Search?: string; search?: string }>;
}) {
  const continenceSlug = process.env.NEXT_PUBLIC_CONTINENCE_CATEGORY_SLUG || "continence-care";

  const params = await searchParams;
  const searchQuery = params?.Search || params?.search;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <>
      <WebsiteStructuredData
        siteUrl={siteUrl}
        potentialAction={{
          "@type": "SearchAction",
          target: `${siteUrl}/?search={search_term_string}`,
          "query-input": "required name=search_term_string",
        }}
      />

      <OrganizationStructuredData siteUrl={siteUrl} />

      <div className="min-h-screen relative">
         {/* Hero */}
         <AnimatedSection>
          <div className="py-4">
            <HeroDualSliderServer />
          </div>
        </AnimatedSection>
        {/* Categories */}
        <Suspense fallback={<div className="h-64 bg-gray-100 rounded mb-10 animate-pulse" />}>
          <CategoriesSection />
        </Suspense>
        {/* Marketing */}
        <MarketingUpdatesSection />
        {/* Product Section */}
        <Suspense fallback={<div className="h-64 bg-gray-100 rounded animate-pulse" />}>
          <ProductSection
            title="Continence care products"
            subtitle="Trusted protection for daily confidence."
            viewAllHref={`/product-category/${encodeURIComponent(continenceSlug)}`}
            query={{ categorySlug: continenceSlug }}
          />
        </Suspense>
        {/* CTA */}
        <NDISCTASection />
        {/* Trending */}
        <Suspense fallback={<div className="h-64 bg-gray-100 rounded animate-pulse" />}>
          <TrendingSection />
        </Suspense>
        {/* Latest */}
        <Suspense fallback={<div className="h-64 bg-gray-100 rounded animate-pulse" />}>
          <ProductSection
            title="Latest Published"
            subtitle="Fresh arrivals from our catalog."
            viewAllHref="/shop?orderby=date&order=desc"
            query={{ orderby: "date", order: "desc" }}
          />
        </Suspense>
        {/* Newsletter */}
        <NewsletterSection />
        {/* Features */} {/* <AnimatedSection> */}
        <FeatureStrip />
      </div>
    </>
  );
}
