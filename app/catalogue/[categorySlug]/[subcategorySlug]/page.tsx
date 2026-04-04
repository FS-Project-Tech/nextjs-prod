import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCategoryBySlug } from "@/lib/woocommerce";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import SubcategoryBook from "@/components/SubcategoryBook";

export const revalidate = 600;
export const dynamicParams = true;

type Props = { params: Promise<{ categorySlug: string; subcategorySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subcategorySlug } = await params;
  const slug = decodeURIComponent(subcategorySlug);
  const category = await fetchCategoryBySlug(slug);
  if (!category) return { title: "Digital Catalogue" };
  return {
    title: `${category.name} | Digital Catalogue`,
    description: category.description || `Digital medical supplies catalogue for ${category.name}.`,
  };
}

export default async function SubcategoryCataloguePage({ params }: Props) {
  const { categorySlug, subcategorySlug } = await params;
  const parentSlug = decodeURIComponent(categorySlug);
  const subSlug = decodeURIComponent(subcategorySlug);

  const parentCategory = await fetchCategoryBySlug(parentSlug);
  const subCategory = await fetchCategoryBySlug(subSlug);

  if (!parentCategory) {
    notFound();
  }
  if (!subCategory || subCategory.parent !== parentCategory.id) {
    notFound();
  }

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Catalogue", href: "/catalogue" },
    { label: parentCategory.name, href: `/catalogue/${encodeURIComponent(parentCategory.slug)}` },
    { label: subCategory.name },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-4">
        <SubcategoryBook
          subcategorySlug={subCategory.slug}
          subcategoryName={subCategory.name}
          parentName={parentCategory.name}
        />
      </div>
    </>
  );
}
