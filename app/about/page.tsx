import type { Metadata } from "next";
import AnimatedSection from "@/components/AnimatedSection";
import HeroHeadingSection from "@/components/about/HeroHeadingSection";
import ServicesSection from "@/components/about/ServicesSection";
import AboutVideoSection from "@/components/about/AboutVideoSection";
import NumberCountersSection from "@/components/about/NumberCountersSection";
import FoundersDeskSection from "@/components/about/FoundersDeskSection";
import WhatMakesUsSpecialSection from "@/components/about/WhatMakesUsSpecialSection";
import JOYAMeaningSection from "@/components/about/JOYAMeaningSection";
import WhereWeSupplySection from "@/components/about/WhereWeSupplySection";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about JOYA - your trusted partner for medical supplies, continence care products, and healthcare essentials. NDIS approved provider serving Australia.",
  openGraph: {
    title: "About Us - JOYA",
    description: "Learn about JOYA - your trusted partner for medical supplies and healthcare essentials.",
    type: "website",
  },
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section with Background */}
      <div className="relative bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50 py-16 md:py-24">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        </div>
        <AnimatedSection>
          <HeroHeadingSection />
        </AnimatedSection>
      </div>

      {/* Main Content */}
      <div className="bg-white">
        <AnimatedSection>
          <ServicesSection />
        </AnimatedSection>

        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        <AnimatedSection>
          <AboutVideoSection />
        </AnimatedSection>

        <AnimatedSection>
          <NumberCountersSection />
        </AnimatedSection>

        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        <AnimatedSection>
          <FoundersDeskSection />
        </AnimatedSection>

        <AnimatedSection>
          <WhatMakesUsSpecialSection />
        </AnimatedSection>

        <AnimatedSection>
          <JOYAMeaningSection />
        </AnimatedSection>

        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        <AnimatedSection>
          <WhereWeSupplySection />
        </AnimatedSection>
      </div>
    </div>
  );
}

