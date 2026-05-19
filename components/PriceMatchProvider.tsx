"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PriceMatchProduct } from "@/lib/price-match/types";

interface PriceMatchState {
  isOpen: boolean;
  product: PriceMatchProduct | null;
  open: (product: PriceMatchProduct) => void;
  close: () => void;
}

const PriceMatchContext = createContext<PriceMatchState | undefined>(undefined);

export default function PriceMatchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [product, setProduct] = useState<PriceMatchProduct | null>(null);

  const open = useCallback((next: PriceMatchProduct) => {
    setProduct(next);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setProduct(null);
  }, []);

  const value = useMemo(
    () => ({ isOpen, product, open, close }),
    [isOpen, product, open, close],
  );

  return <PriceMatchContext.Provider value={value}>{children}</PriceMatchContext.Provider>;
}

export function usePriceMatch(): PriceMatchState {
  const ctx = useContext(PriceMatchContext);
  if (!ctx) throw new Error("usePriceMatch must be used within PriceMatchProvider");
  return ctx;
}
