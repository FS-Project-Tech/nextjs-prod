"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { HEADLESS_CHECKOUT_SESSION_STORAGE_KEY } from "@/lib/checkout/checkoutSessionConstants";
import { clearCheckoutFormDraft } from "@/lib/checkout/checkoutFormPersistence";

function AfterpaySuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clear } = useCart();
  const ranRef = useRef(false);
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const token =
      searchParams.get("token")?.trim() ||
      searchParams.get("orderToken")?.trim() ||
      searchParams.get("orderId")?.trim() ||
      "";

    if (!token) {
      setState("error");
      setMessage("Missing Afterpay token in the return URL.");
      return;
    }

    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const res = await fetch("/api/afterpay/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ token }),
        });

        const payload = (await res.json()) as {
          success?: boolean;
          error?: string;
          order_id?: string | number;
          order_key?: string;
        };

        if (!res.ok || payload.success === false || !payload.order_id) {
          setState("error");
          setMessage(payload.error || `Confirmation failed (HTTP ${res.status}).`);
          return;
        }

        try {
          clear();
          clearCheckoutFormDraft();
          sessionStorage.removeItem(HEADLESS_CHECKOUT_SESSION_STORAGE_KEY);
          sessionStorage.setItem(`headless_clear_cart_for_order_${String(payload.order_id)}`, "1");
          fetch("/api/dashboard/cart/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ items: [] }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }

        const oid = encodeURIComponent(String(payload.order_id));
        const keyQs =
          typeof payload.order_key === "string" && payload.order_key.trim()
            ? `&key=${encodeURIComponent(payload.order_key.trim())}`
            : "";

        setState("done");
        router.replace(`/checkout/order-review?orderId=${oid}${keyQs}`);
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Confirmation failed.");
      }
    };

    void run();
  }, [clear, router, searchParams]);

  if (state === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Afterpay</h1>
        <p className="mt-3 text-sm text-gray-700">{message || "Something went wrong."}</p>
        <Link href="/checkout" className="mt-6 inline-block text-sm font-medium text-blue-800 underline">
          Return to checkout
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div
        className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-solid border-gray-900 border-r-transparent"
        aria-hidden
      />
      <h1 className="text-lg font-semibold text-gray-900">Confirming your Afterpay payment…</h1>
      <p className="mt-2 text-sm text-gray-600">Please wait — creating your order.</p>
    </div>
  );
}

export default function AfterpaySuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-600">Loading…</div>
      }
    >
      <AfterpaySuccessInner />
    </Suspense>
  );
}
