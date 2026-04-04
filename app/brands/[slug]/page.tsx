import { fetchBrandWithProducts } from "@/lib/api";
import BrandPageClient from "@/components/BrandPageClient";
import type { Metadata } from "next";

// ============================================================================
// ISR Configuration
// ============================================================================
export const revalidate = 600; // 10 minutes
export const dynamicParams = true;

// ============================================================================
// Static params (optional - if you want pre-render brands)
// ============================================================================
export async function generateStaticParams() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_WP_URL}/wp-json/custom/v1/brands`, {
      next: { revalidate: 600 },
    });

    const brands = await res.json();

    return brands.map((brand: { slug: string }) => ({
      slug: brand.slug,
    }));
  } catch (error) {
    console.error("Error generating brand static params:", error);
    return [];
  }
}

// ============================================================================
// Metadata (SEO)
// ============================================================================
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await props.params;
    const decodedSlug = decodeURIComponent(slug);

    const brand = await fetchBrandWithProducts(decodedSlug).catch(() => null);

    if (!brand) {
      return { title: "Brand" };
    }

    return {
      title: brand.name,
      description: brand.description
        ? brand.description.replace(/<[^>]+>/g, "").slice(0, 160)
        : `Shop ${brand.name} products`,
      alternates: {
        canonical: `/brand/${decodedSlug}`,
      },
      openGraph: {
        title: brand.name,
        description: brand.description,
        images: brand.image ? [{ url: brand.image }] : [],
      },
    };
  } catch {
    return { title: "Brand" };
  }
}

// ============================================================================
// Page (SERVER)
// ============================================================================
export default async function BrandPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const brand = await fetchBrandWithProducts(decodedSlug).catch(() => null);

  if (!brand) {
    return <div>Brand not found (slug: {decodedSlug})</div>;
  }

  return (
    <BrandPageClient
      brandSlug={decodedSlug}
      brandName={brand.name}
      brandDescription={brand.description}
    />
  );
}
