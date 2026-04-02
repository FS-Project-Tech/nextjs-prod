"use client";
 
import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
 
interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: string;
  total?: string;
  sku?: string;
  image?: { src: string; alt: string };
}
 
interface Order {
  id: number;
  number?: string;
  order_number?: string;
  order_key: string;
  status: string;
  total: string;
  subtotal?: string;
  total_shipping?: string;
  shipping_total?: string;
  tax_total?: string;
  discount_total?: string;
  payment_method: string;
  payment_method_title: string;
  date_created?: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: OrderItem[];
  meta_data?: Array<{ key: string; value: any }>;
}
 
function OrderReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const orderIdFromUrl = searchParams.get("order_id") || searchParams.get("orderId");
  const recoverKey = searchParams.get("recover");
 
  useEffect(() => {
    // Suppress "lab" color function parsing errors from html2canvas/css parsing
    const originalError = console.error;
    console.error = (...args: any[]) => {
      // Filter out "lab" color function errors
      const errorMessage = args[0]?.toString() || '';
      if (errorMessage.includes('lab') && errorMessage.includes('color function')) {
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
        (typeof window !== "undefined"
          ? sessionStorage.getItem("checkout_recover_ik")
          : null);
      if (!key) return null;

      for (let attempt = 0; attempt < 28 && !cancelled; attempt++) {
        try {
          const r = await fetch(
            `/api/checkout/result?key=${encodeURIComponent(key)}`,
            { cache: "no-store", credentials: "same-origin" }
          );
          if (r.ok) {
            const data = await r.json();
            const oid =
              data.order?.number ??
              data.order?.order_number ??
              data.order?.id;
            if (oid != null && String(oid).trim() !== "") {
              try {
                sessionStorage.removeItem("checkout_recover_ik");
              } catch {
                /* ignore */
              }
              const idStr = String(oid);
              router.replace(
                `/checkout/order-review?orderId=${encodeURIComponent(idStr)}`,
                { scroll: false }
              );
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
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to fetch order");
        }
        const data = await res.json();
        if (!cancelled) {
          setOrder(data.order);
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
  }, [orderIdFromUrl, recoverKey, router]);
 
  const handleDownloadPDF = useCallback(async () => {
    if (!order || typeof window === "undefined") return;
 
    setDownloadingPDF(true);
    try {
      // Suppress console errors for unsupported color functions
      const originalError = console.error;
      console.error = (...args: any[]) => {
        // Filter out "lab" color function errors from html2canvas
        if (args[0]?.toString().includes('lab') ||
            args[0]?.toString().includes('color function')) {
          return; // Suppress this specific error
        }
        originalError.apply(console, args);
      };
 
      // Dynamically import html2pdf.js
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = (html2pdfModule.default || html2pdfModule) as any;
 
      const element = document.getElementById("invoice-content");
      if (!element) {
        throw new Error("Invoice content not found");
      }
 
      const opt = {
        margin: [15, 15, 15, 15] as [number, number, number, number],
        filename: `Invoice-${order.number ?? order.order_number ?? orderIdFromUrl ?? order.id}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          ignoreElements: (element: Element) => {
            // Ignore elements that might cause color parsing issues
            return false;
          },
          onclone: (clonedDoc: Document) => {
            // Convert any lab() colors to rgb in the cloned document
            const style = clonedDoc.createElement('style');
            style.textContent = `
              * {
                color-scheme: light !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          },
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait" as const
        },
      };
 
      await (html2pdf as any)().set(opt).from(element).save();
     
      // Restore original console.error
      console.error = originalError;
    } catch (error) {
      console.error("PDF generation error:", error);
      // Fallback to print dialog
      window.print();
    } finally {
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
            <p className="text-gray-600 mb-6">{error || "The order you're looking for doesn't exist."}</p>
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
 
  const getNDISNumber = () => {
    const ndisMeta = order.meta_data?.find((m) => m.key === "NDIS Number");
    return ndisMeta?.value || null;
  };
 
  const getHCPNumber = () => {
    const hcpMeta = order.meta_data?.find((m) => m.key === "HCP Number");
    return hcpMeta?.value || null;
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
  const offlinePaymentMethods = ["cod", "bacs", "bank_transfer", "cheque"];
 
  // Calculate totals
  // Subtotal: use order.subtotal if present, otherwise sum line items (WooCommerce may omit subtotal)
  const subtotalFromLineItems = order.line_items?.reduce((sum, item) => {
    const itemTotal = item.total != null && item.total !== ''
      ? parseFloat(String(item.total))
      : Number(item.price) * (item.quantity || 0);
    return sum + itemTotal;
  }, 0) ?? 0;
  const subtotal = (order.subtotal != null && order.subtotal !== '')
    ? parseFloat(order.subtotal)
    : subtotalFromLineItems;
 
  const shipping = (order.shipping_total ?? order.total_shipping)
    ? parseFloat(String(order.shipping_total ?? order.total_shipping))
    : 0;
  const tax = order.tax_total ? parseFloat(order.tax_total) : 0;
  const discount = order.discount_total ? parseFloat(order.discount_total) : 0;
  const total = parseFloat(order.total);
 
  // Format subtotalFromLineItems
  const orderDate = order.date_created
    ? new Date(order.date_created).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
 
  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Success Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Order Confirmed!</h1>
          <p className="text-gray-600">
            Thank you for your order. We've sent a confirmation email to <strong>{order.billing.email}</strong>
          </p>
        </div>
 
        {/* Invoice Container */}
        <div id="invoice-content" className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Invoice Header */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1">Order Summary</h2>
                <p className="text-gray-300 text-sm">Order #{order.number ?? order.order_number ?? orderIdFromUrl ?? order.id}</p>
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <p className="text-sm text-gray-300">Date</p>
                <p className="font-semibold">{orderDate}</p>
              </div>
            </div>
          </div>
 
          {/* Invoice Body */}
          <div className="p-8">
            {/* Company & Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 pb-8 border-b">
              {/* Company Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">From</h3>
                <div className="text-sm text-gray-700">
                  <p className="font-bold text-lg text-gray-900 mb-1">
                    {process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
                  </p>
                  <p className="text-gray-600">Medical Supplies & Healthcare Products</p>
                  <p className="text-gray-600 mt-2">Australia</p>
                </div>
              </div>
 
              {/* Customer Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Bill To</h3>
                <div className="text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">
                    {order.billing.first_name} {order.billing.last_name}
                  </p>
                  <p>{order.billing.address_1}</p>
                  {order.billing.address_2 && <p>{order.billing.address_2}</p>}
                  <p>
                    {order.billing.city}, {order.billing.state} {order.billing.postcode}
                  </p>
                  <p>{order.billing.country}</p>
                  <p className="mt-2">Phone: {order.billing.phone}</p>
                  <p>Email: {order.billing.email}</p>
                </div>
              </div>
            </div>
 
            {/* Shipping Address (if different) */}
            {order.shipping &&
             (order.shipping.address_1 !== order.billing.address_1 ||
              order.shipping.city !== order.billing.city) && (
              <div className="mb-8 pb-8 border-b">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Ship To</h3>
                <div className="text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">
                    {order.shipping.first_name} {order.shipping.last_name}
                  </p>
                  <p>{order.shipping.address_1}</p>
                  {order.shipping.address_2 && <p>{order.shipping.address_2}</p>}
                  <p>
                    {order.shipping.city}, {order.shipping.state} {order.shipping.postcode}
                  </p>
                  <p>{order.shipping.country}</p>
                </div>
              </div>
            )}
 
            {/* Order Items Table */}
            <div className="mb-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">Item</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">SKU</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">Quantity</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">Price</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.line_items.map((item, index) => {
                    const itemPrice = Number(item.price);
                    const itemTotal = itemPrice * item.quantity;
                    return (
                      <tr key={item.id} className={`border-b ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            {item.image?.src && (
                              <div className="hidden print:block relative h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200">
                                <Image
                                  src={item.image.src}
                                  alt={item.image.alt || item.name}
                                  fill
                                  sizes="48px"
                                  className="object-cover"
                                />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{item.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center text-sm text-gray-600">
                          {item.sku || "—"}
                        </td>
                        <td className="py-4 px-4 text-right text-sm text-gray-900">
                          {item.quantity}
                        </td>
                        <td className="py-4 px-4 text-right text-sm text-gray-900">
                          ${itemPrice.toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-right font-semibold text-gray-900">
                          ${itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
 
            {/* Totals Section */}
            <div className="flex justify-end mb-8">
              <div className="w-full md:w-80">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
                  </div>
                  {shipping > 0 && (
                    <div className="flex justify-between py-2">
                      <span className="text-gray-600">Shipping:</span>
                      <span className="font-medium text-gray-900">${shipping.toFixed(2)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between py-2">
                      <span className="text-gray-600">Tax:</span>
                      <span className="font-medium text-gray-900">${tax.toFixed(2)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between py-2 text-emerald-600">
                      <span>Discount:</span>
                      <span className="font-medium">-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t-2 border-gray-900 pt-3 mt-2">
                    <div className="flex justify-between">
                      <span className="text-lg font-bold text-gray-900">Total:</span>
                      <span className="text-xl font-bold text-gray-900">${total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
 
            {/* Payment & Status Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 pb-8 border-b">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Payment Method</h3>
                <p className="text-sm text-gray-700">{order.payment_method_title}</p>
                {!isPaid && offlinePaymentMethods.includes(order.payment_method) && (
                  <p className="text-xs text-yellow-600 mt-1">Payment Pending</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Order Status</h3>
                <p className={`text-sm font-medium ${
                  order.status === "completed" ? "text-green-600" :
                  order.status === "processing" ? "text-blue-600" :
                  "text-yellow-600"
                }`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </p>
              </div>
            </div>
 
            {/* Additional Information */}
            {(getNDISNumber() || getHCPNumber() || getDeliveryAuthority() || getDeliveryInstructions() || getDoNotSendPaperwork() || getDiscreetPackaging() || getNewsletterSubscription()) && (
              <div className="mb-8 pb-8 border-b">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Additional Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {getNDISNumber() && (
                    <div>
                      <span className="font-medium text-gray-700">NDIS Number:</span>{" "}
                      <span className="text-gray-900">{getNDISNumber()}</span>
                    </div>
                  )}
                  {getHCPNumber() && (
                    <div>
                      <span className="font-medium text-gray-700">HCP Number:</span>{" "}
                      <span className="text-gray-900">{getHCPNumber()}</span>
                    </div>
                  )}
                  {getDeliveryAuthority() && (
                    <div>
                      <span className="font-medium text-gray-700">Delivery Authority:</span>{" "}
                      <span className="text-gray-900">{getDeliveryAuthority()}</span>
                    </div>
                  )}
                  {getDoNotSendPaperwork() && (
                    <div>
                      <span className="font-medium text-gray-700">Do not Send Paperwork With Delivery:</span>{" "}
                      <span className="text-gray-900">Yes</span>
                    </div>
                  )}
                  {getDiscreetPackaging() && (
                    <div>
                      <span className="font-medium text-gray-700">Discreet Packaging:</span>{" "}
                      <span className="text-gray-900">Yes</span>
                    </div>
                  )}
                  {getNewsletterSubscription() && (
                    <div>
                      <span className="font-medium text-gray-700">Newsletter Subscription:</span>{" "}
                      <span className="text-gray-900">Yes</span>
                    </div>
                  )}
                  {getDeliveryInstructions() && (
                    <div className="md:col-span-2">
                      <span className="font-medium text-gray-700">Delivery Instructions:</span>{" "}
                      <span className="text-gray-900">{getDeliveryInstructions()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
 
            {/* Footer Note */}
            <div className="text-center text-xs text-gray-500 pt-4 border-t">
              <p>Thank you for your business!</p>
              <p className="mt-1">If you have any questions about this invoice, please contact us.</p>
            </div>
          </div>
        </div>
 
        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingPDF ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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