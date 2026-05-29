import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/Container";
import ProductGridSkeleton from "@/components/skeletons/ProductGridSkeleton";
import ShopListingLayout from "@/components/ShopListingLayout";
import TagPageClient from "@/components/TagPageClient";
import { fetchProductTagBySlug, fetchProductTagsForSitemap } from "@/lib/woocommerce";
import { stripHTML } from "@/lib/xss-sanitizer";

export const revalidate = 600;
export const dynamicParams = true;
export const dynamic = "force-dynamic";

function TagPageFallback() {
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

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export async function generateStaticParams() {
  try {
    const tags = await fetchProductTagsForSitemap(50);
    return tags
      .filter((tag) => tag.slug)
      .map((tag) => ({
        slug: tag.slug,
      }));
  } catch (error) {
    console.error("Error generating tag static params:", error);
    return [];
  }
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const decodedSlug = decodeSlug(slug);
  const tag = await fetchProductTagBySlug(decodedSlug).catch(() => null);

  if (!tag) {
    return { title: "Product tag" };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const path = `/tag/${encodeURIComponent(tag.slug)}`;
  const canonical = siteUrl ? `${siteUrl}${path}` : path;
  const description = tag.description
    ? stripHTML(tag.description).replace(/\s+/g, " ").trim().slice(0, 160)
    : `Browse products tagged ${tag.name}.`;

  return {
    title: tag.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: tag.name,
      description,
      type: "website",
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: tag.name,
      description,
    },
  };
}

export default async function ProductTagPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const decodedSlug = decodeSlug(slug);
  const tag = await fetchProductTagBySlug(decodedSlug).catch(() => null);

  if (!tag) {
    notFound();
  }

  return (
    <Suspense fallback={<TagPageFallback />}>
      <TagPageClient
        initialSlug={tag.slug}
        initialTagName={tag.name}
        initialTagDescription={tag.description}
      />
    </Suspense>
  );
}
