"use client";

/**
 * Coupon state: we only persist the code. Discount and validation are done by WooCommerce at checkout.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

/** Client only stores the code; Woo validates and applies on the order. */
export type AppliedCoupon = { code: string };

export interface CouponValidationResult {
  valid: boolean;
  coupon?: AppliedCoupon;
  discount?: number;
  error?: string;
}

interface CouponContextType {
  appliedCoupon: AppliedCoupon | null;
  discount: number;
  isLoading: boolean;
  error: string | null;
  validateCoupon: (code: string, items: unknown[], subtotal: number) => Promise<CouponValidationResult>;
  applyCoupon: (code: string, items: unknown[], subtotal: number) => Promise<boolean>;
  removeCoupon: () => void;
  calculateDiscount: (items: unknown[], subtotal: number) => Promise<number>;
}

const CouponContext = createContext<CouponContextType | undefined>(undefined);

function normalizeCouponCode(raw: string): string {
  return raw.trim();
}

export function CouponProvider({ children }: { children: ReactNode }) {
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  /** Always 0 on the client; checkout uses server quote / Woo for real discount */
  const [discount] = useState(0);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedCode = sessionStorage.getItem("applied_coupon");
      if (savedCode?.trim()) {
        setAppliedCoupon({ code: savedCode.trim() });
      }
      sessionStorage.removeItem("coupon_discount");
    } catch {
      /* ignore */
    }
  }, []);

  const validateCoupon = useCallback(
    async (code: string, _items: unknown[], _subtotal: number): Promise<CouponValidationResult> => {
      const c = normalizeCouponCode(code);
      if (!c) {
        return { valid: false, error: "Coupon code is required" };
      }
      return { valid: true, coupon: { code: c }, discount: 0 };
    },
    []
  );

  const applyCoupon = useCallback(async (code: string, _items: unknown[], _subtotal: number) => {
    const c = normalizeCouponCode(code);
    if (!c) {
      setError("Coupon code is required");
      return false;
    }

    setAppliedCoupon({ code: c });
    setError(null);

    try {
      sessionStorage.setItem("applied_coupon", c);
      sessionStorage.removeItem("coupon_discount");
    } catch {
      /* ignore */
    }

    return true;
  }, []);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setError(null);

    try {
      sessionStorage.removeItem("applied_coupon");
      sessionStorage.removeItem("coupon_discount");
    } catch {
      /* ignore */
    }
  }, []);

  const calculateDiscount = useCallback(async (_items: unknown[], _subtotal: number) => 0, []);

  return (
    <CouponContext.Provider
      value={{
        appliedCoupon,
        discount,
        isLoading,
        error,
        validateCoupon,
        applyCoupon,
        removeCoupon,
        calculateDiscount,
      }}
    >
      {children}
    </CouponContext.Provider>
  );
}

export function useCoupon(): CouponContextType {
  const context = useContext(CouponContext);
  if (context === undefined) {
    throw new Error("useCoupon must be used within a CouponProvider");
  }
  return context;
}
