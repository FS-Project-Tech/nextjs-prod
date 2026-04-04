import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCategoryBySlug } from "@/lib/woocommerce";
import {
  getUnifiedCategories,
  findCategoryBySlug,
  getChildrenForParent,
} from "@/lib/categories-unified";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import CategorySubcategoryBook from "@/components/CategorySubcategoryBook";

export const revalidate = 600;
export const dynamicParams = true;

type Props = { params: Promise<{ categorySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const slug = decodeURIComponent(categorySlug);
  const category = await fetchCategoryBySlug(slug);
  if (!category) {
    return { title: "Catalogue" };
  }
  return {
    title: `${category.name} | Catalogue`,
    description: category.description || `Browse subcategories for ${category.name}.`,
  };
}

export default async function CatalogueCategoryPage({ params }: Props) {
  const { categorySlug } = await params;
  const slug = decodeURIComponent(categorySlug);

  const unified = await getUnifiedCategories();
  const fromTree = findCategoryBySlug(unified, slug);
  const parentCategory = fromTree ?? (await fetchCategoryBySlug(slug));
  if (!parentCategory) {
    notFound();
  }

  const subcategories = getChildrenForParent(unified, parentCategory.id, {
    hideEmpty: true,
  });

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Catalogue", href: "/catalogue" },
    { label: parentCategory.name },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <CategorySubcategoryBook
          parentName={parentCategory.name}
          subcategories={subcategories.map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
          }))}
        />
      </div>
    </>
  );
}
