"use client";

import Image from "next/image";
import { memo } from "react";
import type { OrderReviewOrderItem } from "./types";

function OrderItemsInner({ lineItems }: { lineItems: OrderReviewOrderItem[] }) {
  return (
    <div className="mb-8">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-900">
              Item
            </th>
            <th className="px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-gray-900">
              SKU
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-900">
              Quantity
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-900">
              Price
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-900">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => {
            const itemPrice = Number(item.price);
            const itemTotal = itemPrice * item.quantity;
            return (
              <tr key={item.id} className={`border-b ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    {item.image?.src && (
                      <div className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 print:block">
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
                <td className="px-4 py-4 text-center text-sm text-gray-600">{item.sku || "—"}</td>
                <td className="px-4 py-4 text-right text-sm text-gray-900">{item.quantity}</td>
                <td className="px-4 py-4 text-right text-sm text-gray-900">${itemPrice.toFixed(2)}</td>
                <td className="px-4 py-4 text-right font-semibold text-gray-900">
                  ${itemTotal.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(OrderItemsInner);
