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
  const orderNo = String(order.number ?? order.order_number ?? orderIdFromUrl ?? order.id ?? "");

  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-teal-600 shadow-md ring-4 ring-teal-600/20">
          <svg className="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Order Confirmed!</h1>
        <p className="mx-auto max-w-lg text-base text-gray-600">
          Thank you for your order. We&apos;ve sent a confirmation email to{" "}
          <strong className="font-semibold text-gray-900">{order.billing.email}</strong>
        </p>
      </div>

      <div
        id="invoice-content"
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60"
      >
        <div className="bg-gradient-to-r from-[#0d3231] via-[#164948] to-[#1f605f] px-6 py-5 text-white sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Order Summary</h2>
              <p className="mt-1 text-sm font-medium text-white/90">Order #{orderNo}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Date</p>
              <p className="mt-0.5 text-base font-semibold text-white">{orderDate}</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-8 grid grid-cols-1 gap-8 border-b border-gray-200 pb-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">From</h3>
              <div className="text-sm text-gray-700">
                <p className="mb-2 text-lg font-bold text-gray-900">
                  {process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical PTY LTD"}
                </p>
                <p className="text-gray-600">6/7 Hansen Court</p>
                <p className="text-gray-600">Coomera, 4209, QLD</p>
                <p className="mt-1 text-gray-600">Australia</p>
                <p className="mt-3 text-gray-700">
                  <span className="font-medium text-gray-800">Phone:</span> 1300 005 032
                </p>
                <p className="text-gray-700">
                  <span className="font-medium text-gray-800">Email:</span> info@joyamedical.com.au
                </p>
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">
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
              <div className="mb-8 border-b border-gray-200 pb-8">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">
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
