"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function OrderSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const orderRef = searchParams.get("order_id") || searchParams.get("order");
    if (orderRef) {
      router.replace(`/order-review?order_id=${encodeURIComponent(orderRef)}`);
      return;
    }
    router.replace("/order-review");
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
