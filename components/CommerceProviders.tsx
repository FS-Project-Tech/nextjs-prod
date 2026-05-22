"use client";

import CartProvider from "@/components/CartProvider";
import QuoteProvider from "@/components/QuoteProvider";
import PriceMatchProvider from "@/components/PriceMatchProvider";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { CouponProvider } from "@/components/CouponProvider";
import ToastProvider from "@/components/ToastProvider";
import AIOrderAssistant from "@/components/AIOrderAssistant";

export default function CommerceProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WishlistProvider>
        <CartProvider>
          <QuoteProvider>
            <PriceMatchProvider>
              <CouponProvider>
                {children}
                <AIOrderAssistant />
              </CouponProvider>
            </PriceMatchProvider>
          </QuoteProvider>
        </CartProvider>
      </WishlistProvider>
    </ToastProvider>
  );
}
