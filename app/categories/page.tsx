// import type { Metadata } from "next";
// import { BreadcrumbStructuredData } from "@/components/StructuredData";
// import AllCategoriesPageClient from "@/components/AllCategoriesPageClient";

// export const metadata: Metadata = {
//   title: "All Categories",
//   description:
//     "Browse all product categories. Find medical supplies, equipment, and more.",
//   openGraph: {
//     title: "All Categories | Shop by Category",
//     description: "Browse all product categories.",
//     type: "website",
//   },
//   alternates: {
//     canonical: "/categories",
//   },
// };

// export default function AllCategoriesPage() {
//   const breadcrumbItems = [
//     { label: "Home", href: "/" },
//     { label: "All Categories" },
//   ];

//   return (
//     <>
//       <BreadcrumbStructuredData items={breadcrumbItems} />
//       <AllCategoriesPageClient />
//     </>
//   );
// }

import type { Metadata } from "next";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import AllCategoriesPageClient from "@/components/AllCategoriesPageClient";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "All Categories",
  description: "Browse all product categories. Find medical supplies, equipment, and more.",
  openGraph: {
    title: "All Categories | Shop by Category",
    description: "Browse all product categories.",
    type: "website",
    url: `${siteUrl}/categories`,
    images: [
      {
        url: `${siteUrl}/images/categories-og.jpg`,
        width: 1200,
        height: 630,
        alt: "Shop by Category",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "All Categories | Shop by Category",
    description: "Browse all product categories.",
    images: [`${siteUrl}/images/categories-og.jpg`],
  },
  alternates: {
    canonical: `${siteUrl}/categories`,
  },
};

export default function AllCategoriesPage() {
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "All Categories" }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <AllCategoriesPageClient />
    </>
  );
}
