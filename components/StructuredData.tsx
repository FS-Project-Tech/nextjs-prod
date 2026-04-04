/**
 * Structured Data (JSON-LD) Components
 * Provides Schema.org structured data for SEO
 */

interface StructuredDataProps {
  data: Record<string, any>;
}

/**
 * Generic structured data component
 */
export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

/**
 * Product structured data (Schema.org Product)
 */
interface ProductStructuredDataProps {
  product: {
    id: number;
    name: string;
    slug: string;
    description?: string;
    short_description?: string;
    sku?: string;
    price: string;
    regular_price?: string;
    sale_price?: string;
    on_sale?: boolean;
    images?: Array<{ src: string; alt?: string }>;
    stock_status?: string;
    average_rating?: string;
    rating_count?: number;
    categories?: Array<{ name: string; slug: string }>;
  };
  siteUrl?: string;
}

export function ProductStructuredData({
  product,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com",
}: ProductStructuredDataProps) {
  const price =
    product.on_sale && product.sale_price
      ? product.sale_price
      : product.price || product.regular_price;

  const structuredData = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description:
      product.short_description?.replace(/<[^>]*>/g, "") ||
      product.description?.replace(/<[^>]*>/g, "") ||
      product.name,
    image: product.images?.map((img) => img.src) || [],
    sku: product.sku || product.id.toString(),
    brand: {
      "@type": "Brand",
      name: "WooCommerce Store",
    },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/product/${product.slug}`,
      priceCurrency: "AUD",
      price: price,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      availability:
        product.stock_status === "instock"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(product.average_rating &&
      product.rating_count && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: product.average_rating,
          reviewCount: product.rating_count,
        },
      }),
    ...(product.categories &&
      product.categories.length > 0 && {
        category: product.categories[0].name,
      }),
  };

  return <StructuredData data={structuredData} />;
}

/**
 * Breadcrumb structured data (Schema.org BreadcrumbList)
 */
interface BreadcrumbStructuredDataProps {
  items: Array<{ label: string; href?: string }>;
  siteUrl?: string;
}

export function BreadcrumbStructuredData({
  items,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com",
}: BreadcrumbStructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href && {
        item: `${siteUrl}${item.href}`,
      }),
    })),
  };

  return <StructuredData data={structuredData} />;
}

/**
 * Organization structured data (Schema.org Organization)
 */
interface OrganizationStructuredDataProps {
  siteUrl?: string;
  name?: string;
  logo?: string;
}

export function OrganizationStructuredData({
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com",
  name = "WooCommerce Store",
  logo,
}: OrganizationStructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: name,
    url: siteUrl,
    ...(logo && {
      logo: logo,
    }),
    sameAs: [
      // Add your social media URLs here
      // "https://www.facebook.com/yourpage",
      // "https://www.twitter.com/yourhandle",
      // "https://www.instagram.com/yourhandle",
    ],
  };

  return <StructuredData data={structuredData} />;
}

/**
 * Website structured data (Schema.org WebSite)
 */
interface WebsiteStructuredDataProps {
  siteUrl?: string;
  name?: string;
  potentialAction?: {
    "@type": string;
    target: string;
    "query-input": string;
  };
}

export function WebsiteStructuredData({
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com",
  name = "WooCommerce Store",
  potentialAction,
}: WebsiteStructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: name,
    url: siteUrl,
    ...(potentialAction && {
      potentialAction: potentialAction,
    }),
  };

  return <StructuredData data={structuredData} />;
}
