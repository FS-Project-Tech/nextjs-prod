import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import Breadcrumbs from "@/components/Breadcrumbs";
import BrandsLazy from "@/components/BrandsLazy";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Brands",
  description:
    "Shop by brand. Browse all brands and find products from your favorite manufacturers.",
  openGraph: {
    title: "Brands | WooCommerce Store",
    description:
      "Shop by brand. Browse all brands and find products from your favorite manufacturers.",
    type: "website",
  },
  alternates: {
    canonical: "/brands",
  },
};

type Brand = {
  id: number;
  name: string;
  slug: string;
  count?: number;
  image?: string | null;
};

// ✅ FIXED: clean API call
async function getBrands(): Promise<Brand[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/wc/store/v1/products/brands`,
      {
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();

    // ✅ Your API returns array directly
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error fetching brands:", error);
    return [];
  }
}

export default async function BrandsPage() {
  const brands = await getBrands();

  return (
    <main id="main-content" className="min-h-screen py-8">
      <Container>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop/" },
            { label: "Brands" },
          ]}
        />

        <div className="mt-8">
          <h1 className="text-3xl font-bold text-gray-900">Shop by Brand</h1>
          <p className="mt-2 text-gray-600">
            Browse our brands and find products from your favorite manufacturers.
          </p>
          <div className="mt-4 h-1 w-20 rounded-full bg-teal-600" />
        </div>

        {brands.length === 0 ? (
          <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 px-6 py-12 text-center">
            <p className="text-gray-600">No brands available at the moment.</p>
            <Link
              href="/shop"
              className="mt-4 inline-block text-teal-600 font-medium hover:underline"
            >
              Browse all products
            </Link>
          </div>
        ) : (
          <BrandsLazy brands={brands} />
        )}
      </Container>
    </main>
  );
}
