"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";

function ThankYouContent() {
  const searchParams = useSearchParams();
  const orderRef = searchParams.get("order") ?? searchParams.get("order_id");
  const { clear } = useCart();
  const clearedRef = useRef(false);
  const effectiveOrder = orderRef;

  useEffect(() => {
    if (!effectiveOrder || clearedRef.current) return;
    clearedRef.current = true;
    try {
      clear();
    } catch {
      /* ignore */
    }
  }, [effectiveOrder, clear]);

  return (
    <div className="container min-h-screen bg-gray-50 py-16">
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Thank you</h1>
        <p className="mt-3 text-gray-600">
          {effectiveOrder ? "Your order has been placed." : "Your request has been received."}
        </p>
        {effectiveOrder ? (
          <p className="mt-4 text-sm text-gray-700">
            Order reference:{" "}
            <span className="font-mono font-semibold text-gray-900">{effectiveOrder}</span>
          </p>
        ) : null}
        <p className="mt-4 text-sm text-gray-500">
          You will receive a confirmation email shortly. If you have questions, contact our support
          team.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/shop"
            className="inline-flex rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            Continue shopping
          </Link>
          {effectiveOrder ? (
            <Link
              href={`/order-review?order_id=${encodeURIComponent(effectiveOrder)}`}
              className="inline-flex rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View order details
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex min-h-screen items-center justify-center bg-gray-50 py-16">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  );
}
