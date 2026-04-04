"use client";

import CartProvider from "@/components/CartProvider";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { CouponProvider } from "@/components/CouponProvider";
import ToastProvider from "@/components/ToastProvider";

export default function CommerceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WishlistProvider>
        <CartProvider>
          <CouponProvider>{children}</CouponProvider>
        </CartProvider>
      </WishlistProvider>
    </ToastProvider>
  );
}
