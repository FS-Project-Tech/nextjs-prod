"use client";

import { memo } from "react";
import type { OrderReviewOrder } from "./types";

export type PaymentStatusProps = {
  order: OrderReviewOrder;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethodDisplay: string;
  isOnAccountFlow: boolean;
  isPaid: boolean;
  offlinePaymentMethods: string[];
  orderStatusLabel: string;
  orderStatusToneClass: string;
  ndisNumber: string | null;
  hcpNumber: string | null;
  deliveryAuthority: string | null;
  deliveryInstructions: unknown;
  doNotSendPaperwork: boolean;
  discreetPackaging: boolean;
  newsletterSubscription: boolean;
};

function PaymentStatusInner({
  order,
  subtotal,
  shipping,
  tax,
  discount,
  total,
  paymentMethodDisplay,
  isOnAccountFlow,
  isPaid,
  offlinePaymentMethods,
  orderStatusLabel,
  orderStatusToneClass,
  ndisNumber,
  hcpNumber,
  deliveryAuthority,
  deliveryInstructions,
  doNotSendPaperwork,
  discreetPackaging,
  newsletterSubscription,
}: PaymentStatusProps) {
  const showAdditional =
    ndisNumber ||
    hcpNumber ||
    deliveryAuthority ||
    deliveryInstructions ||
    doNotSendPaperwork ||
    discreetPackaging ||
    newsletterSubscription;

  return (
    <>
      <div className="mb-8 flex justify-end">
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
            <div className="flex justify-between py-2">
              <span className="text-gray-600">GST:</span>
              <span className="font-medium text-gray-900">${tax.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between py-2 text-emerald-600">
                <span>Discount:</span>
                <span className="font-medium">-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="mt-2 border-t-2 border-gray-900 pt-3">
              <div className="flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total:</span>
                <span className="text-xl font-bold text-gray-900">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 border-b pb-8 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-900">
            Payment Method
          </h3>
          <p className="text-sm text-gray-700">{paymentMethodDisplay}</p>
          {!isOnAccountFlow &&
            !isPaid &&
            offlinePaymentMethods.includes(order.payment_method) && (
              <p className="mt-1 text-xs text-amber-800">Payment pending</p>
            )}
          {isOnAccountFlow && (
            <p className="mt-1 text-xs text-gray-600">
              Pay on account — your order has been submitted.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-900">
            Order status
          </h3>
          <p className={`text-sm font-medium ${orderStatusToneClass}`}>{orderStatusLabel}</p>
        </div>
      </div>

      {isOnAccountFlow && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-6 pb-8 border-b">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">
            Bank transfer details
          </h3>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>
              <span className="font-medium text-gray-800">Bank name:</span> National Australia Bank
            </li>
            <li>
              <span className="font-medium text-gray-800">Account name:</span> Joya Medical Australia
              Pty Ltd
            </li>
            <li>
              <span className="font-medium text-gray-800">Account number:</span> 852237649
            </li>
            <li>
              <span className="font-medium text-gray-800">BSB:</span> 084-004
            </li>
          </ul>
          <p className="mt-4 text-sm font-medium text-gray-900">
            Please transfer the total amount and include your order number as reference.
          </p>
        </div>
      )}

      {showAdditional && (
        <div className="mb-8 border-b pb-8">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-900">
            Additional Information
          </h3>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            {ndisNumber && (
              <div>
                <span className="font-medium text-gray-700">NDIS Number:</span>{" "}
                <span className="text-gray-900">{ndisNumber}</span>
              </div>
            )}
            {hcpNumber && (
              <div>
                <span className="font-medium text-gray-700">HCP Number:</span>{" "}
                <span className="text-gray-900">{hcpNumber}</span>
              </div>
            )}
            {deliveryAuthority && (
              <div>
                <span className="font-medium text-gray-700">Delivery Authority:</span>{" "}
                <span className="text-gray-900">{deliveryAuthority}</span>
              </div>
            )}
            {doNotSendPaperwork && (
              <div>
                <span className="font-medium text-gray-700">
                  Do not Send Paperwork With Delivery:
                </span>{" "}
                <span className="text-gray-900">Yes</span>
              </div>
            )}
            {discreetPackaging && (
              <div>
                <span className="font-medium text-gray-700">Discreet Packaging:</span>{" "}
                <span className="text-gray-900">Yes</span>
              </div>
            )}
            {newsletterSubscription && (
              <div>
                <span className="font-medium text-gray-700">Newsletter Subscription:</span>{" "}
                <span className="text-gray-900">Yes</span>
              </div>
            )}
            {deliveryInstructions && (
              <div className="md:col-span-2">
                <span className="font-medium text-gray-700">Delivery Instructions:</span>{" "}
                <span className="text-gray-900">{String(deliveryInstructions)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t pt-4 text-center text-xs text-gray-500">
        <p>Thank you for your business!</p>
        <p className="mt-1">If you have any questions about this invoice, please contact us.</p>
      </div>
    </>
  );
}

export default memo(PaymentStatusInner);
