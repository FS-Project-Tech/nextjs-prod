import {
  fetchProductBySlug,
  fetchProductVariations,
  fetchProductReviews,
  fetchProducts,
  WooCommerceVariation,
} from "@/lib/woocommerce";

import ProductGallery from "@/components/ProductGallery";
import ProductDetailPanel from "@/components/ProductDetailPanel";
import { ProductVariationGalleryProvider } from "@/components/product/ProductVariationGalleryProvider";
import ProductInfoAccordion from "@/components/ProductInfoAccordion";
import ProductReviews from "@/app/product/[slug]/ProductReviews";
import Breadcrumbs from "@/components/Breadcrumbs";
import RelatedProductsSection from "@/components/RelatedProductsSection";
import Container from "@/components/Container";

import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getActivePromotions } from "@/lib/getActivePromotions";
import {
  fetchDetailBanner,
  fetchCategoryBannersWithInheritance,
  getBannerLinkUrl,
  bannerRowHasImage,
  resolveBannerRowImageUrl,
  resolvePromoImageUrl,
} from "@/lib/detail-banner";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import {
  DEFAULT_PRODUCT_SIDEBAR_BANNER_ALT,
  DEFAULT_PRODUCT_SIDEBAR_BANNER_SRC,
} from "@/lib/product-detail-defaults";
import { fetchGlobalPromotions } from "@/lib/promotions";
import { fetchProductSEO } from "@/lib/wordpress";
import Script from "next/script";
import { ProductCardProduct } from "@/lib/types/product";
import { cache } from "react";

// ============================================================================
// ISR
// ============================================================================
export const dynamic = "force-dynamic";
export const revalidate = 300;
export const dynamicParams = true;

// ============================================================================
// Static params
// ============================================================================
// export async function generateStaticParams() {
//   try {
//     const result = await fetchProducts({
//       per_page: 100,
//       featured: true,
//     });

//     return (
//       result?.products?.map((p: { slug: string }) => ({
//         slug: p.slug,
//       })) || []
//     );
//   } catch {
//     return [];
//   }
// }

// ============================================================================
// Metadata seo
// ============================================================================
//   export async function generateMetadata(
//  props: { params: Promise<{ slug: string }> }
//   ): Promise<Metadata> {
//  try {
//    const { slug } = await props.params;
//    const decodedSlug = decodeURIComponent(slug);

//    const wpProduct = await fetchProductSEO(decodedSlug);
//    const yoast = wpProduct?.yoast_head_json;

//    if (!yoast) {
//      return { title: wpProduct?.title?.rendered || "Product" };
//    }

//    return {
//      title: yoast.title,
//      description: yoast.description,
//      alternates: { canonical: yoast.canonical },
//    };
//  } catch {
//    return { title: "Product" };
//  }
//   }

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const getProduct = cache(fetchProductBySlug);
  const product = await getProduct(decodedSlug);

  if (!product) {
    return { title: "Product not found" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return {
    title: product.name,
    description: product.short_description?.replace(/<[^>]+>/g, "").slice(0, 160),

    alternates: {
      canonical: `${siteUrl}/product/${product.slug}`,
    },

    openGraph: {
      title: product.name,
      description: product.short_description?.replace(/<[^>]+>/g, "").slice(0, 160),
      type: "website",
      url: `${siteUrl}/product/${product.slug}`,
      images: product.images?.length
        ? [
            {
              url: product.images[0].src,
              width: 1200,
              height: 630,
              alt: product.name,
            },
          ]
        : [],
    },

    twitter: {
      card: "summary_large_image",
      title: product.name,
      description: product.short_description?.replace(/<[^>]+>/g, "").slice(0, 160),
      images: product.images?.length ? [product.images[0].src] : [],
    },
  };
}

// ============================================================================
// Page
// ============================================================================
export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const decodedSlug = decodeURIComponent(slug);

  const getProduct = cache(fetchProductBySlug);
  const product = await getProduct(decodedSlug);
  if (!product) {
    console.error("Product not found for slug:", decodedSlug);
    notFound();
  }

  // =======================================================
  // CATEGORY & BRAND (from product)
  // =======================================================
  const firstCategoryId = product.categories?.[0]?.id;
  const brandAttribute = product.attributes?.find(
    (attr: { slug?: string; options?: string[] }) => attr.slug === "product_brand"
  );
  const currentBrandId = brandAttribute?.options?.[0]
    ? Number(brandAttribute.options[0])
    : undefined;

  // =======================================================
  // PARALLEL FETCH: promotions, variations, category products, reviews
  // (reduces total wait vs sequential fetches)
  // =======================================================
  const [promotions, variations, categoryProductsResult, initialReviews, categoryBanners] =
    await Promise.all([
      fetchGlobalPromotions(),
      product.variations?.length
        ? fetchProductVariations(product.id).catch(() => [] as WooCommerceVariation[])
        : Promise.resolve([] as WooCommerceVariation[]),
      firstCategoryId
        ? fetchProducts({ per_page: 20, category: firstCategoryId })
        : Promise.resolve({ products: [] as any[] }),
      fetchProductReviews(product.id, { per_page: 20 }),
      // fetchDetailBanner(),
      firstCategoryId ? fetchCategoryBannersWithInheritance(firstCategoryId) : Promise.resolve([]),
    ]);

  const categoryIds = product.categories?.map((c) => c.id) || [];
  const activePromotions = getActivePromotions(promotions, categoryIds);
  const categoryProducts = Array.isArray(categoryProductsResult?.products)
    ? categoryProductsResult.products
    : [];
  // =======================================================
  // BANNERS: category repeater first, else global fallback
  // =======================================================
  const safeCategoryBanners = Array.isArray(categoryBanners) ? categoryBanners : [];
  const hasCategoryBanners = safeCategoryBanners.some((row) => bannerRowHasImage(row));
  const bannersToShow = hasCategoryBanners ? safeCategoryBanners : [];

  const wpRestBase = getWordPressRestBaseUrl();
  const resolvedSidebarBanners = await Promise.all(
    bannersToShow.map(async (row, i) => ({
      key: `banner-${i}`,
      link: getBannerLinkUrl(row),
      imgUrl: wpRestBase ? await resolveBannerRowImageUrl(row, wpRestBase) : null,
    }))
  );
  const visibleSidebarBanners = resolvedSidebarBanners.filter((b) => b.imgUrl);

  const resolvedPromos = await Promise.all(
    activePromotions.map(async (promo: any, i: number) => ({
      key: `promo-${i}`,
      promo,
      imgUrl: wpRestBase ? await resolvePromoImageUrl(promo, wpRestBase) : null,
      href: promo.link?.url || "#",
      alt:
        (promo.image &&
        typeof promo.image === "object" &&
        promo.image !== null &&
        "alt" in promo.image
          ? String((promo.image as { alt?: string }).alt || "")
          : "") || "",
    }))
  );
  const visiblePromos = resolvedPromos.filter((p) => p.imgUrl);

  /** No usable banner URLs (incl. after resolving media IDs) → static asset */
  const showDefaultStaticSidebarBanner = visibleSidebarBanners.length === 0;

  // =======================================================
  // TOP SELLING (same category)
  // =======================================================
  const topSellingProducts = Array.isArray(categoryProducts) ? categoryProducts.slice(0, 6) : [];

  // =======================================================
  // OTHER BRAND PRODUCTS (KEY LOGIC)
  // =======================================================
  const otherBrandProducts = currentBrandId
    ? categoryProducts.filter((p: any) => {
        const brandAttr = p.attributes?.find((attr: any) => attr.slug === "product_brand");
        const brandId = brandAttr?.options?.[0] ? Number(brandAttr.options[0]) : null;
        return brandId && brandId !== currentBrandId;
      })
    : [];

  // =======================================================
  // MAPPER
  // =======================================================
  const toProductCardProduct = (p: any): ProductCardProduct => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    price: p.price,
    sale_price: p.sale_price,
    regular_price: p.regular_price,
    on_sale: p.on_sale,
    tax_class: p.tax_class,
    tax_status: p.tax_status,
    average_rating: p.average_rating,
    rating_count: p.rating_count,
    images: p.images,
  });

  return (
    <>
      {/* Product Structured Data for SEO */}
      <Script
        id="product-schema"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org/",
            "@type": "Product",
            name: product.name,
            image: product.images?.map((img: any) => img.src),
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
        {/* Breadcrumb */}
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

        {/* Product header */}
        <Container className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-10">
          <ProductVariationGalleryProvider
            baseImages={product.images.map((img) => ({
              id: img.id,
              src: img.src,
              alt: img.alt || product.name,
              name: img.name,
            }))}
          >
            <section className="lg:col-span-2">
              <ProductGallery />
            </section>

            <section className="lg:col-span-2">
              <ProductDetailPanel product={product} variations={variations} />
            </section>
          </ProductVariationGalleryProvider>

          <aside className="flex flex-col lg:col-span-1 gap-6">
            {visibleSidebarBanners.map(({ key, link, imgUrl }) => (
              <a
                key={key}
                href={link}
                className="block overflow-hidden transition hover:opacity-95 h-[600px]"
              >
                <Image
                  src={imgUrl!}
                  alt="Banner"
                  width={320}
                  height={800}
                  className="w-full h-full object-contain"
                  sizes="320px"
                />
              </a>
            ))}
            {showDefaultStaticSidebarBanner ? (
              <div className="block h-[600px] w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                <Image
                  src={DEFAULT_PRODUCT_SIDEBAR_BANNER_SRC}
                  alt={DEFAULT_PRODUCT_SIDEBAR_BANNER_ALT}
                  width={290}
                  height={800}
                  className="h-full w-full object-contain object-top"
                  sizes="(max-width: 1024px) 100vw, 20vw"
                  priority={false}
                />
              </div>
            ) : null}
            {visiblePromos.map(({ key, href, imgUrl, alt }) => (
              <a
                key={key}
                href={href}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <Image
                  src={imgUrl!}
                  alt={alt}
                  width={320}
                  height={520}
                  className="h-[590px] w-full object-cover"
                />
              </a>
            ))}
          </aside>
        </Container>

        {/* 4 tabs in one line: Australia wide | Delivery time | NDIS Payment option | 24/7 Customer Support */}
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

        {/* Product info */}
        <Container className="mt-10 grid grid-cols-1 lg:grid-cols-1 gap-8">
          <ProductInfoAccordion product={product} variations={variations} />
          <ProductReviews
            productId={product.id}
            averageRating={product.average_rating || "0"}
            ratingCount={product.rating_count || 0}
            reviewsAllowed={product.reviews_allowed !== false}
            initialReviews={initialReviews}
          />
        </Container>

        {/* Related products: show first row (3) here; "View all" goes to shop for the rest */}
        {firstCategoryId && (
          <Container className="mt-10 space-y-10">
            <RelatedProductsSection
              title="Top most selling products"
              products={topSellingProducts.slice(0, 5).map(toProductCardProduct)}
              viewAllHref={`/shop?category=${firstCategoryId}&orderby=popularity`}
            />

            <RelatedProductsSection
              title="Similar products from other brands"
              products={otherBrandProducts.slice(0, 6).map(toProductCardProduct)}
              viewAllHref={
                currentBrandId
                  ? `/shop?category=${firstCategoryId}&exclude_brand=${currentBrandId}`
                  : undefined
              }
            />
          </Container>
        )}
      </main>
    </>
  );
}
