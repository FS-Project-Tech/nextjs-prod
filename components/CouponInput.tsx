"use client";

import { useState, FormEvent, useEffect } from "react";
import { useCoupon } from "./CouponProvider";
import { useCart } from "./CartProvider";
import { X, Tag, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { parseCartTotal } from "@/lib/cart/pricing";
import { formatPrice } from "@/lib/format-utils";

interface CouponInputProps {
  className?: string;
  onApplied?: (code: string, discount: number) => void;
  onRemoved?: () => void;
}

// CouponInput component - uses div instead of form to avoid nesting issues
export default function CouponInput({ className = "", onApplied, onRemoved }: CouponInputProps) {
  const [code, setCode] = useState("");
  const { items, total } = useCart();
  const {
    appliedCoupon,
    discount,
    isLoading,
    error,
    applyCoupon,
    removeCoupon,
    calculateDiscount,
  } = useCoupon();

  const subtotal = parseCartTotal(total);

  // Recalculate discount when items or total changes
  useEffect(() => {
    if (appliedCoupon && items.length > 0) {
      calculateDiscount(items, subtotal);
    }
  }, [items, total, appliedCoupon, calculateDiscount, subtotal]);

  const handleSubmit = async (e?: FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!code.trim()) return;
    if (appliedCoupon) return; // Already have a coupon applied

    const success = await applyCoupon(code.trim(), items, subtotal);

    if (success) {
      // The hook will update the discount state, which will trigger re-render
      // The useEffect will handle recalculation if needed
      setCode(""); // Clear input after successful application
    }
  };

  const handleRemove = () => {
    removeCoupon();
    setCode("");
    onRemoved?.();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Return div-based structure (not form) to avoid nesting in checkout form
  return (
    <div className={className} data-coupon-input="true">
      {!appliedCoupon ? (
        <div className="space-y-2" role="group" aria-label="Coupon code input">
          <label htmlFor="coupon-code" className="block text-sm font-semibold text-gray-900 mb-2">
            <Tag className="inline-block w-4 h-4 mr-1" />
            Have a coupon code?
          </label>
          <div className="flex gap-2">
            <input
              id="coupon-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Enter coupon code"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !code.trim()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                "Apply"
              )}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-emerald-900">
                  Coupon Applied: {appliedCoupon.code}
                </div>
                {discount > 0 && (
                  <div className="text-xs text-emerald-700">
                    {appliedCoupon.type === "percent"
                      ? `${appliedCoupon.amount}% off`
                      : `$${appliedCoupon.amount} off`}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="text-emerald-700 hover:text-emerald-900 transition-colors p-1 hover:bg-emerald-100 rounded"
              aria-label="Remove coupon"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {discount > 0 && (
            <div className="text-sm text-emerald-600 font-medium">
              You saved {formatPrice(discount)}!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
