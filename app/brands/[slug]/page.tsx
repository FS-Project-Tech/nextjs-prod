import { fetchBrandWithProducts } from "@/lib/api";
import BrandPageClient from "@/components/BrandPageClient";
import type { Metadata } from "next";
import { fetchBrandTermSEO, resolveBrandYoastHead } from "@/lib/wordpress";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import { buildNextMetadataFromYoast, type YoastHeadJsonLike } from "@/lib/yoast";
import { stripHTML } from "@/lib/xss-sanitizer";

// ============================================================================
// ISR Configuration
// ============================================================================
export const revalidate = 600; // 10 minutes
export const dynamicParams = true;
export const dynamic = "force-dynamic";

// ============================================================================
// Static params (optional - if you want pre-render brands)
// ============================================================================
export async function generateStaticParams() {
  try {
    const base = getWordPressRestBaseUrl();
    if (!base) return [];
    const res = await fetch(`${base}/wp-json/custom/v1/brands`, {
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
// Metadata — Yoast SEO from WP REST term (`yoast_head_json` on product_brand / pa_brand / brand)
// ============================================================================

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await props.params;
    const decodedSlug = decodeURIComponent(slug);

    const [brand, wpTerm] = await Promise.all([
      fetchBrandWithProducts(decodedSlug).catch(() => null),
      fetchBrandTermSEO(decodedSlug).catch(() => null),
    ]);
    if (!brand) {
      return { title: "Brand" };
    }

    const yoast = await resolveBrandYoastHead(decodedSlug, wpTerm).catch(
      () => ({}) as YoastHeadJsonLike,
    );

    const fallbackDescription =
      stripHTML(brand.description || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || `Shop ${brand.name} products`;

    return buildNextMetadataFromYoast({
      yoast,
      canonicalPath: `/brands/${decodedSlug}`,
      fallbackTitle: brand.name,
      fallbackDescription,
      fallbackImages: brand.image
        ? [{ url: brand.image, alt: brand.name }]
        : undefined,
    });
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