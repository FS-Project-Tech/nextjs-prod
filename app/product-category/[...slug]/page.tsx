import { fetchCategoryBySlug } from "@/lib/woocommerce";
import { getUnifiedCategories, getRootCategoriesNonEmpty } from "@/lib/categories-unified";
import CategoryPageClient from "@/components/CategoryPageClient";
import type { Metadata } from "next";
import { fetchCategorySEO } from "@/lib/wordpress";
import { stripHTML } from "@/lib/xss-sanitizer";

export const revalidate = 600;
export const dynamicParams = true;

function getLeafSlug(input: string[] | string): string {
  const parts = Array.isArray(input) ? input : [input];
  const clean = parts.filter(Boolean);
  return decodeURIComponent(clean[clean.length - 1] || "");
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

export async function generateMetadata(props: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  try {
    const { slug } = await props.params;
    const decodedSlug = getLeafSlug(slug);

    const [wpCategory, wooCategory] = await Promise.all([
      fetchCategorySEO(decodedSlug).catch(() => null),
      fetchCategoryBySlug(decodedSlug).catch(() => null),
    ]);

    const yoast = wpCategory?.yoast_head_json;

    if (yoast) {
      return {
        title: yoast.title,
        description: yoast.description,
        openGraph: {
          title: yoast.og_title,
          description: yoast.og_description,
          url: yoast.canonical,
          images: yoast.og_image?.map(
            (img: { url: string; width?: number; height?: number; alt?: string }) => ({
              url: img.url,
              width: img.width,
              height: img.height,
              alt: img.alt || yoast.title,
            })
          ),
        },
        twitter: {
          card: "summary_large_image",
          title: yoast.twitter_title || yoast.title,
          description: yoast.twitter_description || yoast.description,
          images: yoast.twitter_image ? [yoast.twitter_image] : [],
        },
        alternates: {
          canonical: yoast.canonical,
        },
      };
    }

    const title = wooCategory?.name || wpCategory?.name || "Category";
    const rawDesc = wooCategory?.description;
    const description = rawDesc ? stripHTML(rawDesc).slice(0, 160) : undefined;

    return {
      title,
      description,
      alternates: {
        canonical: `/product-category/${slug.join("/")}`,
      },
    };
  } catch {
    return { title: "Category" };
  }
}

export default async function CategoryPage(props: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await props.params;
  const decodedSlug = getLeafSlug(slug);

  const category = await fetchCategoryBySlug(decodedSlug).catch(() => null);

  return (
    <CategoryPageClient
      initialSlug={decodedSlug}
      initialCategoryName={category?.name}
      initialCategoryDescription={category?.description}
    />
  );
}
