import { Suspense } from "react";
import { fetchCategoryBySlug } from "@/lib/woocommerce";
import { getUnifiedCategories, getRootCategoriesNonEmpty } from "@/lib/categories-unified";
import CategoryPageClient from "@/components/CategoryPageClient";
import Container from "@/components/Container";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import ShopListingLayout from "@/components/ShopListingLayout";
import type { Metadata } from "next";
import { fetchCategorySEO } from "@/lib/wordpress";
import { stripHTML } from "@/lib/xss-sanitizer";

/** Server Suspense fallback — required so `useSearchParams` in the client tree can prerender. */
function CategoryPageFallback() {
  return (
    <ShopListingLayout>
      <div className="min-h-screen py-4">
        <Container>
          <div className="mb-6 h-9 max-w-sm animate-pulse rounded-lg bg-gray-200" aria-hidden />
          <ProductGridSkeleton />
        </Container>
      </div>
    </ShopListingLayout>
  );
}

export const revalidate = 600;
export const dynamicParams = true;

function getLeafSlug(input: string[] | string): string {
  const parts = Array.isArray(input) ? input : [input];
  const clean = parts.filter(Boolean);
  const leaf = clean[clean.length - 1] || "";
  try {
    return decodeURIComponent(leaf);
  } catch {
    // Malformed encoded segments should not crash the page route.
    return leaf;
  }
}

export async function generateStaticParams() {
  try {
    const unified = await getUnifiedCategories();
    const roots = getRootCategoriesNonEmpty(unified).slice(0, 50);
    return roots.map((category) => ({
      slug: [category.slug],
    }));
  } catch (error) {
    console.error("Error generating category static params:", error);
    return [];
  }
}

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
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  try {
    const { slug } = await props.params;
    const decodedSlug = getLeafSlug(slug);
    const pathSegments = slug.filter(Boolean).join("/");

    const [wpCategory, wooCategory] = await Promise.all([
      fetchCategorySEO(decodedSlug).catch(() => null),
      fetchCategoryBySlug(decodedSlug).catch(() => null),
    ]);

    const yoast = wpCategory?.yoast_head_json as YoastHeadJson | undefined;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const defaultPath = `/product-category/${pathSegments}`;
    const defaultCanonical = siteUrl ? `${siteUrl}${defaultPath}` : defaultPath;

    const fallbackTitle = wooCategory?.name || (wpCategory?.name as string | undefined) || "Category";
    const fallbackDescription = wooCategory?.description
      ? stripHTML(wooCategory.description).replace(/\s+/g, " ").trim().slice(0, 160)
      : undefined;

    const title = yoast?.title?.trim() || fallbackTitle;
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
        : wooCategory?.image?.src
          ? [
              {
                url: wooCategory.image.src,
                width: 1200,
                height: 630,
                alt: wooCategory.image.alt || title,
              },
            ]
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
    return { title: "Category" };
  }
}

export default async function CategoryPage(props: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await props.params;
    const decodedSlug = getLeafSlug(slug);

    const category = await fetchCategoryBySlug(decodedSlug).catch(() => null);

  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <CategoryPageClient
        initialSlug={decodedSlug}
        initialCategoryName={category?.name}
        initialCategoryDescription={category?.description}
      />
    </Suspense>
  );
    } catch (error) {
      console.error("[product-category] render fallback", error);
      return <CategoryPageClient initialSlug="" initialCategoryName="Category" initialCategoryDescription="" />;
    }
}
