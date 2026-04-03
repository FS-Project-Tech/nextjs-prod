"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function OrderSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const orderRef = searchParams.get("order_id") || searchParams.get("order");
      const accessCode =
        searchParams.get("AccessCode") || searchParams.get("accessCode");

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
  }, [router, searchParams]);

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
