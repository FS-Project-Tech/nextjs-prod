import { notFound } from "next/navigation";
import {
  fetchProductBySlug,
  fetchProductVariations,
  WooCommerceVariation,
} from "@/lib/woocommerce";
import ProductConsultation from "@/components/ProductConsultation";
import Breadcrumbs from "@/components/Breadcrumbs";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug).catch(() => null);

  if (!product) {
    return {
      title: "Product Not Found",
    };
  }

  return {
    title: `Consultation: ${product.name} | Medical Supplies`,
    description: `Get expert consultation and guidance for ${product.name}. Make an informed purchasing decision.`,
    alternates: {
      canonical: `/product/${slug}/consult`,
    },
  };
}

export default async function ProductConsultationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const product = await fetchProductBySlug(slug).catch(() => null);
  if (!product) {
    notFound();
  }

  // Fetch variations
  const variations: WooCommerceVariation[] = await (async () => {
    try {
      if (!product.variations || product.variations.length === 0)
        return [] as WooCommerceVariation[];
      return await fetchProductVariations(product.id);
    } catch {
      return [] as WooCommerceVariation[];
    }
  })();

  const breadcrumbItems = [
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
    { label: product.name, href: `/product/${slug}` },
    { label: "Consultation" },
  ];

  return (
    <div className="min-h-screen py-12 bg-gray-50">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <ProductConsultation product={product} variations={variations} />
    </div>
  );
}
