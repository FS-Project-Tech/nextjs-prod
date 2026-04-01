"use client";

import type { ReactNode } from "react";
import { ProductListingProvider } from "@/contexts/ProductListingContext";

/** Wraps filter sidebar + product grid so listing/loading state is shared. */
export default function ShopListingLayout({ children }: { children: ReactNode }) {
  return <ProductListingProvider>{children}</ProductListingProvider>;
}
