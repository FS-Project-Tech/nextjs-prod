import { fetchProductSEO } from "@/lib/wordpress";
import { Suspense } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import Container from "@/components/Container";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { stripHTML } from "@/lib/xss-sanitizer";
import Script from "next/script";
import { getProductBySlugCached } from "@/app/product/[slug]/product-fetch-cache";
import ProductMainColumn from "@/app/product/[slug]/ProductMainColumn";
import ProductSidebarColumn from "@/app/product/[slug]/ProductSidebarColumn";
import ProductAccordionOnlySection from "@/app/product/[slug]/ProductAccordionOnlySection";
import ProductReviewsServerSection from "@/app/product/[slug]/ProductReviewsServerSection";
import {
  ProductMainColumnSkeleton,
  ProductSidebarSkeleton,
  ProductAccordionOnlySkeleton,
  ProductReviewsOnlySkeleton,
  ProductRelatedSkeleton,
} from "@/app/product/[slug]/ProductPageSkeletons";

// ============================================================================
// ISR — cacheable product pages (revalidate every 5 min)
// ============================================================================
export const revalidate = 300;
export const dynamicParams = true;

// ============================================================================
// Metadata — Yoast SEO from WordPress REST (`yoast_head_json`)
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
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const [product, wpProduct] = await Promise.all([
    getProductBySlugCached(decodedSlug),
    fetchProductSEO(decodedSlug).catch(() => null),
  ]);

  if (!product) {
    return { title: "Product not found" };
  }

  const yoast = wpProduct?.yoast_head_json as YoastHeadJson | undefined;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const defaultPath = `/product/${product.slug}`;
  const defaultCanonical = siteUrl ? `${siteUrl}${defaultPath}` : defaultPath;

  const fallbackDescription = stripHTML(product.short_description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  const title = yoast?.title?.trim() || product.name;
  const description =
    (yoast?.description && yoast.description.trim()) || (fallbackDescription || undefined);
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
      : product.images?.length
        ? [
            {
              url: product.images[0].src,
              width: 1200,
              height: 630,
              alt: product.name,
            },
          ]
        : [];

  const twitterTitle = yoast?.twitter_title?.trim() || title;
  const twitterDescription =
    (yoast?.twitter_description && yoast.twitter_description.trim()) || description;
  const twitterImages = yoast?.twitter_image
    ? [yoast.twitter_image]
    : ogImages.length > 0
      ? [ogImages[0].url]
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
}

// ============================================================================
// Page — product fetch once; main column + sidebar + below-fold stream in parallel
// ============================================================================
export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const product = await getProductBySlugCached(decodedSlug);
  if (!product) {
    console.error("Product not found for slug:", decodedSlug);
    notFound();
  }

  const { default: ProductRelatedSections } = await import(
    "@/app/product/[slug]/ProductRelatedSections"
  );

  return (
    <>
      <Script
        id="product-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org/",
            "@type": "Product",
            name: product.name,
            image: product.images?.map((img: { src: string }) => img.src),
            description: product.short_description?.replace(/<[^>]+>/g, ""),
            sku: product.sku,
            aggregateRating:
              product.rating_count > 0
                ? {
                    "@type": "AggregateRating",
                    ratingValue: product.average_rating,
                    reviewCount: product.rating_count,
                  }
                : undefined,
            offers: {
              "@type": "Offer",
              priceCurrency: "AUD",
              price: product.price,
              availability:
                product.stock_status === "instock"
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              url: `${process.env.NEXT_PUBLIC_SITE_URL}/product/${product.slug}`,
            },
          }),
        }}
      />
      <main id="main-content" className="min-h-screen py-12">
        <Container>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              ...(product.categories?.[0]
                ? [
                    {
                      label: product.categories[0].name,
                      href: `/product-category/${product.categories[0].slug}`,
                    },
                  ]
                : []),
              { label: product.name },
            ]}
          />
        </Container>

        <Container className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-10">
          <Suspense fallback={<ProductMainColumnSkeleton />}>
            <ProductMainColumn product={product} />
          </Suspense>
          <Suspense fallback={<ProductSidebarSkeleton />}>
            <ProductSidebarColumn product={product} />
          </Suspense>
        </Container>

        <Container className="mt-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Australia wide</p>
                <p className="mt-0.5 text-xs text-gray-500">We deliver nationwide</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Delivery time</p>
                <p className="mt-0.5 text-xs text-gray-500">3–7 business days</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M3 10h18M9 14h6" />
                  <path d="M13 10l2 2 4-4" strokeWidth="2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">NDIS Payment option</p>
                <p className="mt-0.5 text-xs text-gray-500">Claim-friendly</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                  <path d="M3 14v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2M21 14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2" />
                  <circle cx="7" cy="16" r="2" />
                  <circle cx="17" cy="16" r="2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">24/7 Customer Support</p>
                <p className="mt-0.5 text-xs text-gray-500">Here to help</p>
              </div>
            </div>
          </div>
        </Container>

        <Suspense fallback={<ProductAccordionOnlySkeleton />}>
          <ProductAccordionOnlySection product={product} />
        </Suspense>
        <Suspense fallback={<ProductReviewsOnlySkeleton />}>
          <ProductReviewsServerSection product={product} />
        </Suspense>

        <Suspense fallback={<ProductRelatedSkeleton />}>
          <ProductRelatedSections product={product} />
        </Suspense>
      </main>
    </>
  );
}
