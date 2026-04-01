"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ProductListingContextValue = {
  listingBusy: boolean;
  setListingBusy: (busy: boolean) => void;
};

const ProductListingContext = createContext<ProductListingContextValue | null>(
  null
);

export function ProductListingProvider({ children }: { children: ReactNode }) {
  const [listingBusy, setListingBusyState] = useState(false);
  const setListingBusy = useCallback((busy: boolean) => {
    setListingBusyState(busy);
  }, []);

  const value = useMemo(
    () => ({ listingBusy, setListingBusy }),
    [listingBusy, setListingBusy]
  );

  return (
    <ProductListingContext.Provider value={value}>
      {children}
    </ProductListingContext.Provider>
  );
}

export function useProductListing() {
  return useContext(ProductListingContext);
}
