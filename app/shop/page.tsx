import type { Metadata } from "next";
import ProductsPageClient from "@/components/ProductsPageClient";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

// ============================================================================
// ISR Configuration - Revalidate shop page every 5 minutes
// ============================================================================
export const revalidate = 600; // 10 minutes

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse our complete product catalog. Find the perfect products for your needs with fast shipping and secure checkout.",
  openGraph: {
    title: "Shop | WooCommerce Store",
    description: "Browse our complete product catalog. Find the perfect products for your needs.",
    type: "website",
  },
  alternates: {
    canonical: "/shop",
  },
};

export default function ShopPage() {
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Shop" }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <ProductsPageClient />
    </>
  );
}
