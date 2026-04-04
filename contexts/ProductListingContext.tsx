"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ProductListingContextValue = {
  listingBusy: boolean;
  setListingBusy: (busy: boolean) => void;
  /** Total matching products from the latest grid search (page 1); for mobile filter footer. */
  listingTotal: number | null;
  setListingTotal: (total: number | null) => void;
};

const ProductListingContext = createContext<ProductListingContextValue | null>(null);

export function ProductListingProvider({ children }: { children: ReactNode }) {
  const [listingBusy, setListingBusyState] = useState(false);
  const [listingTotal, setListingTotalState] = useState<number | null>(null);
  const setListingBusy = useCallback((busy: boolean) => {
    setListingBusyState(busy);
  }, []);
  const setListingTotal = useCallback((total: number | null) => {
    setListingTotalState(total);
  }, []);

  const value = useMemo(
    () => ({ listingBusy, setListingBusy, listingTotal, setListingTotal }),
    [listingBusy, setListingBusy, listingTotal, setListingTotal]
  );

  return <ProductListingContext.Provider value={value}>{children}</ProductListingContext.Provider>;
}

export function useProductListing() {
  return useContext(ProductListingContext);
}
