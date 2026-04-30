"use client";

/**
 * Coupon state: code + server-validated discount (Woo-aligned via /api/coupons/validate).
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  ReactNode,
} from "react";
import type { CartItem } from "@/lib/types/cart";
import {
  APPLIED_COUPON_SESSION_KEY,
  COUPON_DISCOUNT_SESSION_KEY,
  readAppliedCouponFromSession,
} from "@/lib/coupon/clientAppliedCouponSession";

/** Client stores the code; discount is the last successful API quote for the current cart. */
export type AppliedCoupon = { code: string };

export interface CouponValidationResult {
  valid: boolean;
  coupon?: AppliedCoupon;
  discount?: number;
  error?: string;
}

function cartLinesToPayload(items: CartItem[]) {
  return items.map((it) => ({
    productId: it.productId,
    variationId: it.variationId,
    qty: it.qty,
    price: it.price,
  }));
}

interface CouponContextType {
  appliedCoupon: AppliedCoupon | null;
  discount: number;
  isLoading: boolean;
  error: string | null;
  validateCoupon: (code: string, items: CartItem[], subtotal: number) => Promise<CouponValidationResult>;
  applyCoupon: (code: string, items: CartItem[], subtotal: number) => Promise<boolean>;
  removeCoupon: () => void;
  calculateDiscount: (items: CartItem[], subtotal: number) => Promise<number>;
}

const CouponContext = createContext<CouponContextType | undefined>(undefined);

function normalizeCouponCode(raw: string): string {
  return raw.trim();
}

export function CouponProvider({ children }: { children: ReactNode }) {
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(() => {
    const { code } = readAppliedCouponFromSession();
    return code ? { code } : null;
  });
  const [discount, setDiscount] = useState(() => readAppliedCouponFromSession().discount);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Same-tab: sessionStorage is ready before paint; lazy state handles Strict Mode remounts. */
  useLayoutEffect(() => {
    const { code, discount: d } = readAppliedCouponFromSession();
    if (code) {
      setAppliedCoupon((prev) => (prev?.code === code ? prev : { code }));
      setDiscount((prev) => (prev === d ? prev : d));
    }
  }, []);

  /** Back/forward cache & edge cases: storage may update while React state was reset. */
  useEffect(() => {
    const syncFromStorage = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const { code, discount: d } = readAppliedCouponFromSession();
      if (code) {
        setAppliedCoupon((prev) => prev ?? { code });
        setDiscount((prev) => (prev > 0 ? prev : d));
      }
    };
    document.addEventListener("visibilitychange", syncFromStorage);
    window.addEventListener("pageshow", syncFromStorage);
    return () => {
      document.removeEventListener("visibilitychange", syncFromStorage);
      window.removeEventListener("pageshow", syncFromStorage);
    };
  }, []);

  const validateCoupon = useCallback(
    async (code: string, items: CartItem[], subtotal: number): Promise<CouponValidationResult> => {
      const c = normalizeCouponCode(code);
      if (!c) {
        return { valid: false, error: "Coupon code is required" };
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: c,
            subtotal,
            items: cartLinesToPayload(items),
          }),
        });
        const data = (await res.json()) as {
          valid?: boolean;
          error?: string;
          discount?: number;
          coupon?: { code?: string };
        };
        if (!res.ok) {
          const msg = data.error || "Failed to validate coupon";
          setError(msg);
          return { valid: false, error: msg };
        }
        if (!data.valid) {
          const msg = data.error || "Invalid coupon";
          setError(msg);
          return { valid: false, error: msg };
        }
        const disc = typeof data.discount === "number" ? data.discount : 0;
        return {
          valid: true,
          coupon: { code: data.coupon?.code ?? c },
          discount: disc,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Coupon validation failed";
        setError(msg);
        return { valid: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const applyCoupon = useCallback(
    async (code: string, items: CartItem[], subtotal: number) => {
      const c = normalizeCouponCode(code);
      if (!c) {
        setError("Coupon code is required");
        return false;
      }

      const result = await validateCoupon(c, items, subtotal);
      if (!result.valid || !result.coupon) {
        return false;
      }

      const disc = result.discount ?? 0;
      setAppliedCoupon(result.coupon);
      setDiscount(disc);
      setError(null);

      try {
        sessionStorage.setItem(APPLIED_COUPON_SESSION_KEY, result.coupon.code);
        sessionStorage.setItem(COUPON_DISCOUNT_SESSION_KEY, String(disc));
      } catch {
        /* ignore */
      }

      return true;
    },
    [validateCoupon],
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setDiscount(0);
    setError(null);

    try {
      sessionStorage.removeItem(APPLIED_COUPON_SESSION_KEY);
      sessionStorage.removeItem(COUPON_DISCOUNT_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const calculateDiscount = useCallback(async (items: CartItem[], subtotal: number) => {
    if (!appliedCoupon?.code) return 0;
    const result = await validateCoupon(appliedCoupon.code, items, subtotal);
    if (!result.valid) return 0;
    const disc = result.discount ?? 0;
    setDiscount(disc);
    try {
      sessionStorage.setItem(COUPON_DISCOUNT_SESSION_KEY, String(disc));
    } catch {
      /* ignore */
    }
    return disc;
  }, [appliedCoupon?.code, validateCoupon]);

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
