"use client";

import dynamic from "next/dynamic";
import type { ProductReviewsProps } from "@/app/product/[slug]/ProductReviews";

const ProductReviews = dynamic(() => import("@/app/product/[slug]/ProductReviews"), {
  ssr: false,
  loading: () => (
    <div
      className="min-h-[200px] animate-pulse rounded-xl bg-gray-100"
      aria-hidden
    />
  ),
});

type Props = ProductReviewsProps;

/**
 * Reviews hydrate after main thread settles — keeps product LCP path lighter.
 * Initial data still fetched on the server and passed as props (no extra client round-trip).
 */
export default function ProductReviewsLazy(props: Props) {
  return <ProductReviews {...props} />;
}
