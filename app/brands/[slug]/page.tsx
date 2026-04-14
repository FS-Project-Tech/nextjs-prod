import { fetchBrandWithProducts } from "@/lib/api";
import BrandPageClient from "@/components/BrandPageClient";
import type { Metadata } from "next";
import {
  fetchBrandTermSEO,
  fetchBrandYoastHeadJsonFromYoastApi,
} from "@/lib/wordpress";
import { extractDescriptionsFromYoastHead } from "@/lib/yoast";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
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

type YoastOgImage = { url: string; width?: number; height?: number; alt?: string };

type YoastHeadJson = {
  title?: string;
  description?: string;
  canonical?: string;
  og_title?: string;
  og_description?: string;
  og_image?: YoastOgImage[];
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
};

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

    const yoast = wpTerm?.yoast_head_json as YoastHeadJson | undefined;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const defaultPath = `/brands/${decodedSlug}`;
    const defaultCanonical = siteUrl ? `${siteUrl}${defaultPath}` : defaultPath;

    const fallbackDescription =
      stripHTML(brand.description || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || `Shop ${brand.name} products`;

    const title = yoast?.title?.trim() || brand.name;
    const description =
      (yoast?.description && yoast.description.trim()) || fallbackDescription || undefined;
    const canonical = (yoast?.canonical && yoast.canonical.trim()) || defaultCanonical;

    const ogTitle = yoast?.og_title?.trim() || title;
    const ogDescription =
      (yoast?.og_description && yoast.og_description.trim()) || description;
    const ogImages =
      yoast?.og_image && yoast.og_image.length > 0
        ? yoast.og_image.map((img) => ({
            url: img.url,
            width: img.width,
            height: img.height,
            alt: img.alt || ogTitle,
          }))
        : brand.image
          ? [{ url: brand.image, alt: title }]
          : [];

    const twitterTitle = yoast?.twitter_title?.trim() || title;
    const twitterDescription =
      (yoast?.twitter_description && yoast.twitter_description.trim()) || description;
    const firstOgUrl =
      ogImages.length > 0 && typeof ogImages[0] === "object" && ogImages[0]?.url
        ? ogImages[0].url
        : undefined;
    const twitterImages = yoast?.twitter_image
      ? [yoast.twitter_image]
      : firstOgUrl
        ? [firstOgUrl]
        : [];

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        type: "website",
        url: canonical,
        images: ogImages,
      },
      twitter: {
        card: "summary_large_image",
        title: twitterTitle,
        description: twitterDescription,
        images: twitterImages,
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