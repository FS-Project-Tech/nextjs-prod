"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";

function PaymentFailedContent() {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled");
  const { clear } = useCart();
  const clearedRef = useRef(false);

  useEffect(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    try {
      clear();
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container min-h-screen bg-gray-50 py-16">
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Payment failed</h1>
        <p className="mt-3 text-gray-600">
          {cancelled === "true"
            ? "Your payment was cancelled. No order was created."
            : "We could not confirm your payment. Please try again."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/checkout"
            className="inline-flex rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            Back to checkout
          </Link>
          <Link
            href="/shop"
            className="inline-flex rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex min-h-screen items-center justify-center bg-gray-50 py-16">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <PaymentFailedContent />
    </Suspense>
  );
}
