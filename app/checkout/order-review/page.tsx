"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import type { OrderReviewOrder } from "@/components/checkout/order-review/types";
import OrderReviewSummary from "@/components/checkout/order-review/OrderReviewSummary";
import OrderItems from "@/components/checkout/order-review/OrderItems";
import PaymentStatus from "@/components/checkout/order-review/PaymentStatus";
import { downloadOrderInvoicePdf } from "@/lib/order-review-pdf";

function OrderReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clear } = useCart();
  const [order, setOrder] = useState<OrderReviewOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const orderIdFromUrl = searchParams.get("order_id") || searchParams.get("orderId");
  const accessCodeFromUrl = searchParams.get("AccessCode") || searchParams.get("accessCode");
  const recoverKey = searchParams.get("recover");
  /** Set by checkout when redirecting after Place on account order (Woo may still return another gateway id). */
  const paymentMethodHint = (
    searchParams.get("pm") ||
    searchParams.get("payment_method") ||
    ""
  ).toLowerCase();

  useEffect(() => {
    // Suppress "lab" color function parsing errors from html2canvas/css parsing
    const originalError = console.error;
    console.error = (...args: any[]) => {
      // Filter out "lab" color function errors
      const errorMessage = args[0]?.toString() || "";
      if (errorMessage.includes("lab") && errorMessage.includes("color function")) {
        return; // Suppress this specific error
      }
      originalError.apply(console, args);
    };

    return () => {
      // Restore original console.error on unmount
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const resolveOrderIdFromRecover = async (): Promise<string | null> => {
      const key =
        recoverKey ||
        (typeof window !== "undefined" ? sessionStorage.getItem("checkout_recover_ik") : null);
      if (!key) return null;

      for (let attempt = 0; attempt < 28 && !cancelled; attempt++) {
        try {
          const r = await fetch(`/api/checkout/result?key=${encodeURIComponent(key)}`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (r.ok) {
            const raw = (await r.text()).replace(/^\uFEFF/, "").trim();
            let data: { order?: { number?: string; order_number?: string; id?: number } } = {};
            if (raw) {
              try {
                data = JSON.parse(raw) as typeof data;
              } catch {
                /* continue retry */
              }
            }
            const oid = data.order?.number ?? data.order?.order_number ?? data.order?.id;
            if (oid != null && String(oid).trim() !== "") {
              try {
                sessionStorage.removeItem("checkout_recover_ik");
              } catch {
                /* ignore */
              }
              const idStr = String(oid);
              router.replace(`/checkout/order-review?orderId=${encodeURIComponent(idStr)}`, {
                scroll: false,
              });
              return idStr;
            }
          }
        } catch {
          /* retry */
        }
        await sleep(400);
      }
      return null;
    };

    const run = async () => {
      setLoading(true);
      setError(null);

      let orderId: string | null = orderIdFromUrl;

      if (!orderId && recoverKey) {
        orderId = await resolveOrderIdFromRecover();
      } else if (!orderId && typeof window !== "undefined") {
        const stored = sessionStorage.getItem("checkout_recover_ik");
        if (stored) {
          orderId = await resolveOrderIdFromRecover();
        }
      }

      if (cancelled) return;

      if (!orderId) {
        setError(
          recoverKey
            ? "We couldn’t load your order confirmation yet. If you were charged, check your email or your account orders — do not pay again."
            : "Order ID is required"
        );
        setLoading(false);
        return;
      }

      try {
        const orderApiUrl = accessCodeFromUrl
          ? `/api/orders/${orderId}?AccessCode=${encodeURIComponent(accessCodeFromUrl)}`
          : `/api/orders/${orderId}`;
        const res = await fetch(orderApiUrl, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const responseText = (await res.text()).replace(/^\uFEFF/, "");
        const trimmed = responseText.trim();

        if (!res.ok) {
          let msg = `Unable to load order (HTTP ${res.status}).`;
          if (trimmed) {
            try {
              const errBody = JSON.parse(trimmed) as { error?: string; message?: string };
              if (typeof errBody.error === "string" && errBody.error.trim()) {
                msg = errBody.error.trim();
              } else if (typeof errBody.message === "string" && errBody.message.trim()) {
                msg = errBody.message.trim();
              }
            } catch {
              /* keep msg */
            }
          }
          throw new Error(msg);
        }

        if (!trimmed) {
          throw new Error("Order service returned an empty response. Try refreshing the page.");
        }

        let data: { order?: OrderReviewOrder };
        try {
          data = JSON.parse(trimmed) as { order?: OrderReviewOrder };
        } catch (e) {
          const hint = e instanceof SyntaxError ? e.message : "Invalid JSON from order service";
          throw new Error(hint);
        }

        if (!data.order || typeof data.order !== "object") {
          throw new Error("Order details were missing from the server response.");
        }

        if (!cancelled) {
          setOrder(data.order);
          try {
            if (typeof window !== "undefined" && data.order) {
              const oid = String(data.order.id ?? "");
              let shouldClear = false;
              if (oid && sessionStorage.getItem(`headless_clear_cart_for_order_${oid}`)) {
                sessionStorage.removeItem(`headless_clear_cart_for_order_${oid}`);
                shouldClear = true;
              }
              if (sessionStorage.getItem("headless_clear_cart_after_woo_token_checkout")) {
                sessionStorage.removeItem("headless_clear_cart_after_woo_token_checkout");
                shouldClear = true;
              }
              if (shouldClear) {
                clear();
                fetch("/api/dashboard/cart/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ items: [] }),
                }).catch(() => {});
              }
            }
          } catch {
            /* ignore */
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load order");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [orderIdFromUrl, recoverKey, router, accessCodeFromUrl, clear]);

  const handleDownloadPDF = useCallback(async () => {
    if (!order || typeof window === "undefined") return;

    setDownloadingPDF(true);
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const s = String(args[0] ?? "");
      if (s.includes("lab") || s.includes("color function")) return;
      originalError(...args);
    };
    try {
      await downloadOrderInvoicePdf(
        `Invoice-${order.number ?? order.order_number ?? orderIdFromUrl ?? order.id}.pdf`
      );
    } catch (error) {
      console.error("PDF generation error:", error);
      window.print();
    } finally {
      console.error = originalError;
      setDownloadingPDF(false);
    }
  }, [order, orderIdFromUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">
            {recoverKey ? "Confirming your order…" : "Loading order details..."}
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <h1 className="text-2xl font-semibold mb-4">Order Not Found</h1>
            <p className="text-gray-600 mb-6">
              {error || "The order you're looking for doesn't exist."}
            </p>
            <Link
              href="/shop"
              className="inline-block rounded-md bg-gray-900 px-6 py-3 text-white hover:bg-black"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const getNDISNumber = (): string | null => {
    const ndisMeta = order.meta_data?.find((m) => m.key === "NDIS Number");
    const v = ndisMeta?.value;
    if (v == null || String(v).trim() === "") return null;
    return String(v);
  };

  const getHCPNumber = (): string | null => {
    const hcpMeta = order.meta_data?.find((m) => m.key === "HCP Number");
    const v = hcpMeta?.value;
    if (v == null || String(v).trim() === "") return null;
    return String(v);
  };

  const getMetaValue = (key: string) => {
    const meta = order.meta_data?.find((m) => m.key === key);
    return meta?.value ?? null;
  };

  const getDeliveryAuthority = () => {
    const value = getMetaValue("Signature Required");
    return value === "yes" ? "With Signature" : null;
  };

  const getDeliveryInstructions = () => {
    return getMetaValue("Delivery Instructions");
  };

  const getDoNotSendPaperwork = () => {
    const value = getMetaValue("Do not Send Paperwork With Delivery");
    return value === "yes";
  };

  const getDiscreetPackaging = () => {
    const value = getMetaValue("Discreet Packaging");
    return value === "yes";
  };

  const getNewsletterSubscription = () => {
    const value = getMetaValue("Newsletter Subscription");
    return value === "yes";
  };

  const isPaid = order.status === "processing" || order.status === "completed";
  const offlinePaymentMethods = [
    "cod",
    "bacs",
    "bank_transfer",
    "cheque",
    "on_account", // legacy orders only
  ];

  const isOnAccountFlow =
    paymentMethodHint === "cod" ||
    paymentMethodHint === "on_account" ||
    String(order.payment_method || "").toLowerCase() === "cod" ||
    String(order.payment_method || "").toLowerCase() === "on_account";

  const paymentMethodDisplay = isOnAccountFlow ? "On Account" : order.payment_method_title;

  /** Receipt label: show Completed once payment is successful/processing */
  const orderStatusLabel = (() => {
    const s = String(order.status || "").toLowerCase();
    const pm = String(order.payment_method || "").toLowerCase();
    if (isOnAccountFlow) {
      if (s === "cancelled") return "Cancelled";
      if (s === "refunded") return "Refunded";
      if (s === "failed") return "Failed";
      return "Order Placed";
    }
    if (pm === "eway" && (s === "processing" || s === "completed")) {
      return "Payment Done";
    }
    if (s === "processing") return "Completed";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "on-hold") return "On hold";
    if (s === "cancelled") return "Cancelled";
    if (s === "refunded") return "Refunded";
    if (s === "failed") return "Failed";
    return order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : "—";
  })();

  const orderStatusToneClass = (() => {
    const s = String(order.status || "").toLowerCase();
    if (isOnAccountFlow) {
      if (s === "cancelled" || s === "refunded" || s === "failed") {
        return s === "cancelled" ? "text-amber-800" : "text-red-700";
      }
      return "text-blue-700";
    }
    if (s === "completed") return "text-green-700";
    if (s === "processing") return "text-blue-700";
    return "text-amber-800";
  })();

  // Calculate totals
  // Subtotal: use order.subtotal if present, otherwise sum line items (WooCommerce may omit subtotal)
  const subtotalFromLineItems =
    order.line_items?.reduce((sum, item) => {
      const itemTotal =
        item.total != null && item.total !== ""
          ? parseFloat(String(item.total))
          : Number(item.price) * (item.quantity || 0);
      return sum + itemTotal;
    }, 0) ?? 0;
  const subtotal =
    order.subtotal != null && order.subtotal !== ""
      ? parseFloat(order.subtotal)
      : subtotalFromLineItems;

  const shipping =
    (order.shipping_total ?? order.total_shipping)
      ? parseFloat(String(order.shipping_total ?? order.total_shipping))
      : 0;
  const taxRaw = order.total_tax ?? order.tax_total;
  let tax = taxRaw != null && String(taxRaw).trim() !== "" ? parseFloat(String(taxRaw)) : 0;
  if (!Number.isFinite(tax)) tax = 0;
  const discount = order.discount_total ? parseFloat(order.discount_total) : 0;
  const total = parseFloat(order.total);

  // Format subtotalFromLineItems
  const orderDate = order.date_created
    ? new Date(order.date_created).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const ndisNumber = getNDISNumber();
  const hcpNumber = getHCPNumber();
  const deliveryAuthority = getDeliveryAuthority();
  const deliveryInstructions = getDeliveryInstructions();
  const doNotSendPaperwork = getDoNotSendPaperwork();
  const discreetPackaging = getDiscreetPackaging();
  const newsletterSubscription = getNewsletterSubscription();

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <OrderReviewSummary order={order} orderIdFromUrl={orderIdFromUrl} orderDate={orderDate}>
          <OrderItems lineItems={order.line_items} />
          <PaymentStatus
            order={order}
            subtotal={subtotal}
            shipping={shipping}
            tax={tax}
            discount={discount}
            total={total}
            paymentMethodDisplay={paymentMethodDisplay}
            isOnAccountFlow={isOnAccountFlow}
            isPaid={isPaid}
            offlinePaymentMethods={offlinePaymentMethods}
            orderStatusLabel={orderStatusLabel}
            orderStatusToneClass={orderStatusToneClass}
            ndisNumber={ndisNumber}
            hcpNumber={hcpNumber}
            deliveryAuthority={deliveryAuthority}
            deliveryInstructions={deliveryInstructions}
            doNotSendPaperwork={doNotSendPaperwork}
            discreetPackaging={discreetPackaging}
            newsletterSubscription={newsletterSubscription}
          />
        </OrderReviewSummary>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingPDF ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Download PDF</span>
              </>
            )}
          </button>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-black transition-colors"
          >
            <span>Continue Shopping</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <OrderReviewContent />
    </Suspense>
  );
}
