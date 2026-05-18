"use client";

import CartProvider from "@/components/CartProvider";
import QuoteProvider from "@/components/QuoteProvider";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { CouponProvider } from "@/components/CouponProvider";
import ToastProvider from "@/components/ToastProvider";

export default function CommerceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WishlistProvider>
        <CartProvider>
          <QuoteProvider>
            <CouponProvider>{children}</CouponProvider>
          </QuoteProvider>
        </CartProvider>
      </WishlistProvider>
    </ToastProvider>
  );
}
