import RecommendedPageClient from "@/components/RecommendedPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products you may be looking for",
  description: "Browse all products based on your recent searches and popular picks.",
};

export default function RecommendedPage() {
  return <RecommendedPageClient />;
}
