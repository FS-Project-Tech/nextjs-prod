"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { useCart } from "@/components/CartProvider";
import { useSession } from "next-auth/react";
import { parseCartTotal } from "@/lib/cart/pricing";
import { formatPrice } from "@/lib/format-utils";
import { pickPrimaryQuoteAddresses } from "@/lib/quote-request-addresses";
import type { CheckoutQuoteContactPayload } from "@/lib/checkout/checkoutQuoteContact";

interface RequestQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  shippingAmount?: number;
  shippingMethod?: string;
  discount?: number;
  grandTotal?: number;
  /**
   * Checkout flow: resolve contact + addresses from the form at submit time (guests and logged-in).
   * When set, login is not required.
   */
  resolveCheckoutContact?: () => CheckoutQuoteContactPayload | null;
}

export default function RequestQuoteModal({
  isOpen,
  onClose,
  shippingAmount = 0,
  shippingMethod = "",
  discount = 0,
  grandTotal,
  resolveCheckoutContact,
}: RequestQuoteModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const { success, error: showError } = useToast();
  const { items, total } = useCart();
  const { data: session } = useSession();
  const user = session?.user ?? null;

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const hasCheckoutResolver = Boolean(resolveCheckoutContact);
    const checkoutContact = resolveCheckoutContact?.() ?? null;

    if (hasCheckoutResolver) {
      if (!checkoutContact) {
        showError("Could not read your checkout details. Refresh the page and try again.");
        return;
      }
    } else if (!user || !user.email) {
      showError("Please log in to request a quote, or use Request a quote on the checkout page.");
      return;
    }

    setIsSubmitting(true);
    try {
      const subtotal = parseCartTotal(total);
      const finalTotal =
        grandTotal !== undefined ? grandTotal : subtotal + shippingAmount - discount;

      let email: string;
      let userName: string;
      let billing_address: Record<string, string> | undefined;
      let shipping_address: Record<string, string> | undefined;

      if (checkoutContact) {
        email = checkoutContact.email;
        userName = checkoutContact.userName;
        if (Object.keys(checkoutContact.billing_address).length > 0) {
          billing_address = checkoutContact.billing_address as Record<string, string>;
        }
        if (Object.keys(checkoutContact.shipping_address).length > 0) {
          shipping_address = checkoutContact.shipping_address as Record<string, string>;
        }
      } else {
        email = user!.email!;
        userName = user!.name || user!.email?.split("@")[0] || "Customer";
        try {
          const addrRes = await fetch("/api/dashboard/addresses", {
            credentials: "include",
            cache: "no-store",
          });
          if (addrRes.ok) {
            const addrData = (await addrRes.json()) as { addresses?: Record<string, unknown>[] };
            const list = Array.isArray(addrData.addresses) ? addrData.addresses : [];
            const picked = pickPrimaryQuoteAddresses(list);
            if (picked.billing && Object.keys(picked.billing).length > 0) {
              billing_address = picked.billing as Record<string, string>;
            }
            if (picked.shipping && Object.keys(picked.shipping).length > 0) {
              shipping_address = picked.shipping as Record<string, string>;
            }
          }
        } catch {
          /* addresses optional for confirmation email */
        }
      }

      const response = await fetch("/api/quote/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          userName,
          items: items.map((item) => ({
            name: item.name,
            sku: item.sku || null,
            price: item.price,
            qty: item.qty,
            attributes: item.attributes || {},
            deliveryPlan: item.deliveryPlan || "none",
          })),
          subtotal: subtotal,
          shipping: shippingAmount,
          shippingMethod: shippingMethod,
          discount: discount,
          total: finalTotal,
          notes: notes.trim() || undefined,
          ...(billing_address ? { billing_address } : {}),
          ...(shipping_address ? { shipping_address } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit quote request");
      }

      const quoteNumber = data.quote_number || data.quote_id || "your quote";
      success(`Quote request ${quoteNumber} submitted successfully! Check your email for details.`);
      setNotes(""); // Reset notes
      onClose();
    } catch (err: any) {
      console.error("Quote request error:", err);
      showError(err.message || "Failed to submit quote request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemCount = items.length;
  const subtotal = parseFloat(total || "0");
  const finalTotal = grandTotal !== undefined ? grandTotal : subtotal + shippingAmount - discount;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-quote-modal-title"
    >
      <div className="relative z-[1] max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 id="request-quote-modal-title" className="text-xl font-bold text-white">
              Request a Quote
            </h2>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-teal-100 p-3">
                <svg
                  className="h-8 w-8 text-teal-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Confirm Quote Request
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              You are about to request a quote for the items in your cart. Our team will review your
              request and get back to you shortly.
            </p>

            {/* Cart Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Items in cart:</span>
                  <span className="font-medium text-gray-900">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-semibold text-gray-900">{formatPrice(subtotal)}</span>
                </div>
                {shippingAmount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Shipping:</span>
                    <span className="font-medium text-gray-900">{formatPrice(shippingAmount)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex items-center justify-between text-sm text-emerald-600">
                    <span>Discount:</span>
                    <span className="font-medium">−{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900">Total:</span>
                    <span className="text-lg font-bold text-teal-600">
                      {formatPrice(finalTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Field */}
            <div className="mb-6">
              <label htmlFor="quote-notes" className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                id="quote-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                placeholder="Any special requirements, delivery preferences, or questions..."
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-gray-500">
                Help us provide you with the best quote by sharing any specific requirements.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
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
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>Confirm & Submit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
