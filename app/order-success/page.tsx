"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";

function OrderSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clear } = useCart();
  const clearedRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      const orderRef =
        searchParams.get("order_id") ||
        searchParams.get("order") ||
        searchParams.get("orderId");
      const accessCode =
        searchParams.get("AccessCode") || searchParams.get("accessCode");

      // Clear cart once after returning from payment (checkout no longer clears before eWAY).
      if (!clearedRef.current) {
        clearedRef.current = true;
        try {
          clear();
          if (typeof window !== "undefined") {
            if (orderRef) {
              try {
                sessionStorage.removeItem(
                  `headless_clear_cart_for_order_${String(orderRef)}`
                );
              } catch {
                /* ignore */
              }
            }
            try {
              sessionStorage.removeItem("headless_clear_cart_after_woo_token_checkout");
            } catch {
              /* ignore */
            }
            fetch("/api/dashboard/cart/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ items: [] }),
            }).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }

      if (accessCode) {
        try {
          const res = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              AccessCode: accessCode,
              orderId: orderRef || undefined,
            }),
            cache: "no-store",
          });
          const data = await res.json();
          console.log("[order-success] verify-payment result", data);
        } catch (error) {
          console.log("[order-success] verify-payment failed", error);
        }
      }

      if (orderRef) {
        router.replace(`/order-review?order_id=${encodeURIComponent(orderRef)}`);
        return;
      }
      router.replace("/order-review");
    };

    run();
  }, [router, searchParams, clear]);

  return (
    <div className="container flex min-h-screen items-center justify-center py-16">
      <p className="text-gray-600">Finalizing your order...</p>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex min-h-screen items-center justify-center py-16">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
