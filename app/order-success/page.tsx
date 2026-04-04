"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";

type VerifyState = "idle" | "loading" | "paid" | "pending" | "error";

function OrderSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clear } = useCart();
  const clearedRef = useRef(false);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  useEffect(() => {
    const orderRef =
      searchParams.get("order_id") || searchParams.get("order") || searchParams.get("orderId");
    const accessCode = searchParams.get("AccessCode") || searchParams.get("accessCode");
    const vpSig = searchParams.get("vp_sig") || searchParams.get("paymentSig");

    const run = async () => {
      if (!clearedRef.current) {
        clearedRef.current = true;
        try {
          clear();
          if (typeof window !== "undefined") {
            if (orderRef) {
              try {
                sessionStorage.removeItem(`headless_clear_cart_for_order_${String(orderRef)}`);
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
        setVerifyState("loading");
        try {
          const res = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              AccessCode: accessCode,
              orderId: orderRef || undefined,
              ...(vpSig ? { vp_sig: vpSig } : {}),
            }),
            cache: "no-store",
            credentials: "include",
          });
          const payload = (await res.json()) as {
            success?: boolean;
            paid?: boolean;
            error?: string;
          };

          if (!res.ok) {
            setVerifyState("error");
            setVerifyMessage(payload.error || "Verification request failed.");
            return;
          }

          if (payload.paid === true) {
            setVerifyState("paid");
          } else {
            setVerifyState("pending");
            setVerifyMessage(
              "Payment is still being confirmed. You can safely wait here or check your email — do not pay again."
            );
          }
        } catch {
          setVerifyState("error");
          setVerifyMessage("Could not verify payment. Check your email or order history.");
        }
        return;
      }

      if (orderRef) {
        router.replace(`/order-review?order_id=${encodeURIComponent(orderRef)}`);
        return;
      }
      router.replace("/order-review");
    };

    void run();
  }, [router, searchParams, clear]);

  useEffect(() => {
    const orderRef =
      searchParams.get("order_id") || searchParams.get("order") || searchParams.get("orderId");
    const accessCode = searchParams.get("AccessCode") || searchParams.get("accessCode");
    if (accessCode && verifyState === "paid" && orderRef) {
      router.replace(`/order-review?order_id=${encodeURIComponent(orderRef)}`);
    }
  }, [verifyState, router, searchParams]);

  const orderRef =
    searchParams.get("order_id") || searchParams.get("order") || searchParams.get("orderId");
  const accessCode = searchParams.get("AccessCode") || searchParams.get("accessCode");

  if (accessCode && verifyState === "loading") {
    return (
      <div className="container flex min-h-screen flex-col items-center justify-center gap-4 py-16">
        <p className="text-gray-700">Confirming payment with your bank…</p>
      </div>
    );
  }

  if (accessCode && verifyState === "pending") {
    return (
      <div className="container flex max-w-lg flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Processing payment</h1>
        <p className="text-gray-600">{verifyMessage}</p>
        {orderRef ? (
          <Link
            href={`/order-review?order_id=${encodeURIComponent(orderRef)}`}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            View order status
          </Link>
        ) : null}
      </div>
    );
  }

  if (accessCode && verifyState === "error") {
    return (
      <div className="container flex max-w-lg flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">We couldn&apos;t confirm payment yet</h1>
        <p className="text-gray-600">{verifyMessage}</p>
        {orderRef ? (
          <Link
            href={`/order-review?order_id=${encodeURIComponent(orderRef)}`}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            View order
          </Link>
        ) : null}
      </div>
    );
  }

  if (accessCode && verifyState === "paid") {
    return (
      <div className="container flex min-h-screen items-center justify-center py-16">
        <p className="text-gray-600">Payment confirmed. Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="container flex min-h-screen items-center justify-center py-16">
      <p className="text-gray-600">Finalizing your order…</p>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex min-h-screen items-center justify-center py-16">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <OrderSuccessInner />
    </Suspense>
  );
}
