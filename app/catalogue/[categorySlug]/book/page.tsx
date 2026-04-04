import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCategoryBySlug } from "@/lib/woocommerce";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import CategoryBookClient from "@/components/CategoryBookClient";

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
    title: `${category.name} | Digital Catalogue`,
    description: category.description || `Digital product catalogue for ${category.name}.`,
  };
}

export default async function CategoryBookPage({ params }: Props) {
  const { categorySlug } = await params;
  const slug = decodeURIComponent(categorySlug);

  const category = await fetchCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Catalogue", href: "/catalogue" },
    { label: category.name },
  ];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <CategoryBookClient categorySlug={category.slug} categoryName={category.name} />
      </div>
    </>
  );
}
