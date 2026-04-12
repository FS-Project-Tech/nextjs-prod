"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";
import CouponInput from "@/components/CouponInput";
import { formatPrice } from "@/lib/format-utils";
import { FOCUS_RING_LINK } from "@/lib/checkout/uiConstants";
import type { CartItem } from "@/lib/types/cart";

function productDetailHref(line: CartItem): string | null {
  const slug = line.slug?.trim();
  if (!slug) return null;
  if (line.variationId != null && line.variationId > 0) {
    return `/product/${slug}?variation_id=${line.variationId}`;
  }
  return `/product/${slug}`;
}

export type OrderSummaryProps = {
  items: CartItem[];
  subtotal: number;
  couponDiscount: number;
  appliedCoupon: { code: string } | null;
  shippingCost: number;
  gst: number;
  orderTotal: number;
  /** Server quote in flight — totals may briefly match cart-only estimate. */
  totalsSyncing?: boolean;
};

function OrderSummary({
  items,
  subtotal,
  couponDiscount,
  appliedCoupon,
  shippingCost,
  gst,
  orderTotal,
  totalsSyncing = false,
}: OrderSummaryProps) {
  return (
    <>
      <h2
        id="checkout-order-summary-heading"
        className="mb-4 text-lg font-semibold text-gray-900"
      >
        Order summary
      </h2>
      {totalsSyncing ? (
        <p className="-mt-2 mb-3 text-xs text-gray-500" aria-live="polite">
          Updating totals to match checkout…
        </p>
      ) : null}

      <ul className="mb-4 list-none space-y-2 p-0">
        {items.map((line) => {
          const href = productDetailHref(line);
          return (
            <li key={line.id} className="flex items-start gap-3 text-sm">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={`${line.name} — product thumbnail`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center text-xs text-gray-600"
                    role="img"
                    aria-label={`No image available for ${line.name}`}
                  >
                    No image
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {href ? (
                  <Link
                    href={href}
                    className={`font-medium text-gray-900 hover:underline ${FOCUS_RING_LINK}`}
                  >
                    {line.name}
                  </Link>
                ) : (
                  <div className="font-medium text-gray-900">{line.name}</div>
                )}
                <div className="text-xs text-gray-600">Quantity: {line.qty}</div>
                <div className="font-semibold text-gray-900">
                  {formatPrice(Number(line.price) * line.qty)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mb-4">
        <CouponInput />
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-800">Subtotal</span>
          <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
        </div>
        {couponDiscount > 0 && (
          <div className="flex items-center justify-between text-emerald-800">
            <span>Discount {appliedCoupon && `(${appliedCoupon.code})`}</span>
            <span className="font-medium">-{formatPrice(couponDiscount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-800">Shipping</span>
          <span className="font-medium text-gray-900">{formatPrice(shippingCost)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-800">GST (10%)</span>
          <span className="font-medium text-gray-900">{formatPrice(gst)}</span>
        </div>
        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="flex items-center justify-between text-base">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">{formatPrice(orderTotal)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(OrderSummary);
