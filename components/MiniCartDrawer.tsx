"use client";

import { useCart } from "@/components/CartProvider";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, memo } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useCoupon } from "./CouponProvider";
import { useShippingAddress } from "@/hooks/useShippingAddress";
import {
  calculateGST,
  calculateSubtotal,
  calculateTaxableSubtotal,
  calculateTotal,
} from "@/lib/cart/pricing";
import { formatPrice, formatPriceWithLabel } from "@/lib/format-utils";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";
import { sanitizeString } from "@/lib/sanitize";
import { getCartUrl } from "@/lib/access-token";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Dynamically import RequestQuoteModal - only needed when quote button is clicked
// Using a function to ensure stable module resolution during HMR
const RequestQuoteModal = dynamic(() => import("@/components/RequestQuoteModal"), {
  ssr: false, // Client-side only modal
  loading: () => null, // No loading state needed for modal
});

const ShippingOptionsSkeleton = () => (
  <div className="space-y-2" aria-hidden="true">
    {Array.from({ length: 2 }).map((_, idx) => (
      <div key={idx} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
    ))}
  </div>
);

const ShippingOptions = dynamic(() => import("@/components/ShippingOptions"), {
  ssr: false,
  loading: () => <ShippingOptionsSkeleton />,
});

// Memoized cart item component to prevent unnecessary re-renders
const CartItem = memo(
  ({
    item,
    onRemove,
    onUpdateQty,
  }: {
    item: any;
    onRemove: (id: string) => void;
    onUpdateQty: (id: string, qty: number) => void;
  }) => {
    const safeName = useMemo(() => sanitizeString(item?.name || ""), [item?.name]);
    const safeSku = useMemo(() => sanitizeString(item?.sku || ""), [item?.sku]);
    const normalizedAttributes = useMemo(() => {
      if (!item?.attributes) return [];
      return Object.entries(item.attributes).map(([key, value]) => ({
        key: sanitizeString(String(key)),
        value: sanitizeString(String(value)),
      }));
    }, [item?.attributes]);

    const handleQtyChange = (newQty: number) => {
      const qty = Math.max(1, Math.floor(newQty));
      onUpdateQty(item.id, qty);
    };

    const handleDecrement = () => {
      if (item.qty > 1) {
        onUpdateQty(item.id, item.qty - 1);
      }
    };

    const handleIncrement = () => {
      onUpdateQty(item.id, item.qty + 1);
    };

    return (
      <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm ring-1 ring-transparent transition hover:ring-teal-100">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
          {item.imageUrl && item.imageUrl.trim() !== "" ? (
            <Image
              src={item.imageUrl}
              alt={safeName || "Cart item"}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs text-gray-600">
              No Image
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
            {safeName || "Unnamed product"}
          </h3>
          {safeSku && <p className="text-xs text-gray-500 mt-0.5">SKU: {safeSku}</p>}
          {normalizedAttributes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {normalizedAttributes.map((attr) => (
                <span
                  key={`${attr.key}-${attr.value}`}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {attr.key}: {attr.value}
                </span>
              ))}
            </div>
          )}
          {item.deliveryPlan && item.deliveryPlan !== "none" && (
            <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
              <svg
                className="h-3.5 w-3.5 text-teal-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {getDeliveryFrequencyLabel(item.deliveryPlan)}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center rounded-full border border-gray-200 bg-white">
              <button
                onClick={handleDecrement}
                disabled={item.qty <= 1}
                className="px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <input
                type="number"
                min="1"
                value={item.qty}
                onChange={(e) => handleQtyChange(Number(e.target.value))}
                className="w-12 border-0 bg-transparent text-center text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
                aria-label="Quantity"
              />
              <button
                onClick={handleIncrement}
                className="px-2 py-1 text-gray-600 hover:bg-gray-50"
                aria-label="Increase quantity"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              {(() => {
                const priceInfo = formatPriceWithLabel(item.price, item.tax_class, item.tax_status);
                const totalPrice = Number(item.price) * item.qty;
                const totalInfo = formatPriceWithLabel(
                  totalPrice.toString(),
                  item.tax_class,
                  item.tax_status
                );
                return (
                  <div className="text-right">
                    <div className="text-base font-semibold text-gray-900">
                      {totalInfo.label ? `${totalInfo.label}: ${totalInfo.price}` : totalInfo.price}
                    </div>
                    {priceInfo.label && (
                      <div className="text-xs text-gray-500">
                        {priceInfo.label}: {priceInfo.price} each
                      </div>
                    )}
                    {totalInfo.exclPrice && (
                      <div className="text-xs text-gray-600">
                        Excl. GST: {totalInfo.exclPrice}
                      </div>
                    )}
                  </div>
                );
              })()}
              <button
                onClick={() => onRemove(item.id)}
                className="rounded-full p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Remove item"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

CartItem.displayName = "CartItem";

export default function MiniCartDrawer() {
  const { isOpen, close, items, removeItem, updateItemQty, clear } = useCart();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const { discount, appliedCoupon, calculateDiscount } = useCoupon();

  const [selectedRateId, setSelectedRateId] = useState<string>("");
  const [selectedShippingRate, setSelectedShippingRate] = useState<{
    cost: number;
    label: string;
  } | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const { country: shippingCountry, zone: shippingZone } = useShippingAddress();

  const subtotal = useMemo(() => calculateSubtotal(items), [items]);
  const taxableSubtotal = useMemo(() => calculateTaxableSubtotal(items), [items]);
  const shippingAmount = selectedShippingRate ? selectedShippingRate.cost : 0;
  const couponDiscount = discount || 0;
  const gst = useMemo(
    () => calculateGST(subtotal, shippingAmount, couponDiscount, 0, taxableSubtotal),
    [subtotal, taxableSubtotal, shippingAmount, couponDiscount]
  );
  const grandTotal = useMemo(
    () => calculateTotal(subtotal, shippingAmount, couponDiscount, gst),
    [subtotal, shippingAmount, couponDiscount, gst]
  );

  // Memoize handlers to prevent CartItem re-renders
  const handleRemove = useCallback(
    (id: string) => {
      removeItem(id);
    },
    [removeItem]
  );

  const handleUpdateQty = useCallback(
    (id: string, qty: number) => {
      updateItemQty(id, qty);
    },
    [updateItemQty]
  );

  const { containerRef } = useFocusTrap({
    enabled: isOpen,
    onEscape: close,
    initialFocusSelector: 'button[aria-label="Close"]',
  });

  // Combined discount effects
  useEffect(() => {
    if (appliedCoupon && items.length > 0 && isOpen) {
      calculateDiscount(items, subtotal);
    }
  }, [items, appliedCoupon, calculateDiscount, isOpen, subtotal]);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isOpen}
        suppressHydrationWarning
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
          onClick={close}
          suppressHydrationWarning
        />

        {/* Panel */}
        <aside
          ref={containerRef as any}
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart drawer"
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl transition-transform duration-300 ease-out flex flex-col overflow-y-auto ${isOpen ? "translate-x-0" : "translate-x-full"}`}
          suppressHydrationWarning
        >
          {/* Header - Compact */}
          <div
            className="bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 flex items-center justify-between shrink-0"
            suppressHydrationWarning
          >
            <div>
              <h2 className="text-base font-bold text-white">Cart</h2>
              <p className="text-sm text-gray-200">
                {items.length} {items.length === 1 ? "item" : "items"}
              </p>
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0" suppressHydrationWarning>
            <div className="flex-1 overflow-y-auto min-h-0">
              {items.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-16 px-4 text-center"
                  suppressHydrationWarning
                >
                  <div className="mb-3 rounded-full bg-gray-100 p-5">
                    <svg
                      className="h-10 w-10 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-500 font-medium mb-0.5">Your cart is empty</p>
                  <p className="text-sm text-gray-600">Add items to get started</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {items.map((it) => (
                    <CartItem
                      key={it.id}
                      item={it}
                      onRemove={handleRemove}
                      onUpdateQty={handleUpdateQty}
                    />
                  ))}
                </div>
              )}

              {items.length > 0 && (
                <div className="border-t bg-gray-50" suppressHydrationWarning>
                  <div className="p-3 space-y-3">
                    {/* Shipping Options - Always Visible */}
                    {/* {isOpen && items.length > 0 && (
                                    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs uppercase tracking-wide text-gray-600">Delivery method</p>
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {selectedShippingRate?.label || "Choose a shipping option"}
                                                </p>
                                            </div>
                                            <div className="text-base font-bold text-gray-900">
                                                {selectedShippingRate ? formatPrice(selectedShippingRate.cost) : "--"}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Select a shipping service that works best for your order.
                                        </p>
                                        <ShippingOptions
                                            country={shippingCountry}
                                            zone={shippingZone}
                                            subtotal={subtotal}
                                            items={items}
                                            selectedRateId={selectedRateId}
                                            onRateChange={(rateId, rate) => {
                                                setSelectedRateId(rateId);
                                                setSelectedShippingRate({ cost: rate.cost, label: sanitizeString(rate.label || "") });
                                            }}
                                            showLabel={false}
                                            className="space-y-2"
                                        />
                                    </div>
                                )} */}

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Shipping</span>
                        <span className="font-medium text-gray-900">
                          {formatPrice(shippingAmount)}
                        </span>
                      </div>
                      {couponDiscount > 0 && (
                        <div className="flex items-center justify-between text-sm text-emerald-600">
                          <span>Discount</span>
                          <span className="font-medium">−{formatPrice(couponDiscount)}</span>
                        </div>
                      )}
                      {gst > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">GST (10%)</span>
                          <span className="font-medium text-gray-900">{formatPrice(gst)}</span>
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-bold text-gray-900">Total</span>
                          <span className="text-2xl font-bold text-teal-600">
                            {formatPrice(grandTotal)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {gst > 0
                            ? "GST applies only to taxable items in your cart."
                            : "No GST on this cart total (GST-free items only)."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="shrink-0 mt-auto border-t border-gray-200 bg-white p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={clear}
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Clear cart
                  </button>
                  {user && (
                    <button
                      onClick={() => setShowQuoteModal(true)}
                      className="flex-1 rounded-xl border-2 border-teal-600 bg-white px-3 py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
                    >
                      Request quote
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href={getCartUrl()}
                    onClick={close}
                    className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                  >
                    View cart
                  </Link>
                  <Link
                    href="/checkout"
                    onClick={close}
                    className="block w-full rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 text-center text-base font-semibold text-white hover:from-black hover:to-gray-900 transition-all shadow-lg hover:shadow-xl"
                  >
                    Proceed to checkout
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Request Quote Modal */}
      <RequestQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        shippingAmount={shippingAmount}
        shippingMethod={selectedShippingRate?.label || ""}
        discount={couponDiscount}
        grandTotal={grandTotal}
      />
    </>
  );
}
