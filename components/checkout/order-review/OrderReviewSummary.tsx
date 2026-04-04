"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import type { OrderReviewOrder } from "./types";

export type OrderReviewSummaryProps = {
  order: OrderReviewOrder;
  orderIdFromUrl: string | null;
  orderDate: string;
  children: ReactNode;
};

function OrderReviewSummaryInner({ order, orderIdFromUrl, orderDate, children }: OrderReviewSummaryProps) {
  return (
    <>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Order Confirmed!</h1>
        <p className="text-gray-600">
          Thank you for your order. We&apos;ve sent a confirmation email to{" "}
          <strong>{order.billing.email}</strong>
        </p>
      </div>

      <div id="invoice-content" className="overflow-hidden rounded-lg bg-white shadow-lg">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="mb-1 text-2xl font-bold">Order Summary</h2>
              <p className="text-sm text-gray-300">
                Order #{order.number ?? order.order_number ?? orderIdFromUrl ?? order.id}
              </p>
            </div>
            <div className="mt-4 text-right md:mt-0">
              <p className="text-sm text-gray-300">Date</p>
              <p className="font-semibold">{orderDate}</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-8 grid grid-cols-1 gap-8 border-b pb-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">From</h3>
              <div className="text-sm text-gray-700">
                <p className="mb-1 text-lg font-bold text-gray-900">
                  {process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical PTY LTD"}
                </p>
                <p className="text-gray-600">6/7 Hansen Court</p>
                <p className="text-gray-600">Coomera, 4209, QLD</p>
                <p className="mt-2 text-gray-600">Australia</p>
                <p className="mt-2 text-gray-600">Phone: 1300 005 032</p>
                <p className="mt-2 text-gray-600">Email: info@joyamedical.com.au</p>
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">
                Bill To
              </h3>
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

          {order.shipping &&
            (order.shipping.address_1 !== order.billing.address_1 ||
              order.shipping.city !== order.billing.city) && (
              <div className="mb-8 border-b pb-8">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">
                  Ship To
                </h3>
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

          {children}
        </div>
      </div>
    </>
  );
}

export default memo(OrderReviewSummaryInner);
