"use client";

import Image from "next/image";
import { memo, useMemo } from "react";
import type { OrderReviewOrderItem } from "./types";

function parseMoney(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function OrderItemsInner({ lineItems }: { lineItems: OrderReviewOrderItem[] }) {
  const rows = useMemo(
    () =>
      lineItems.map((item) => {
        const unit = parseMoney(item.price) ?? 0;
        const fromWoo = parseMoney(item.total);
        const lineTotal = fromWoo != null ? fromWoo : unit * (item.quantity || 0);
        return { item, unit, lineTotal };
      }),
    [lineItems]
  );

  return (
    <div className="mb-8 -mx-1 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-100">
            <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-800 sm:px-4">
              Item
            </th>
            <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-800 sm:px-4">
              SKU
            </th>
            <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-800 sm:px-4">
              Quantity
            </th>
            <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-800 sm:px-4">
              Price
            </th>
            <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-800 sm:px-4">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, unit, lineTotal }, index) => (
            <tr
              key={item.id}
              className={`border-b border-gray-200 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/80"}`}
            >
              <td className="max-w-[200px] px-3 py-3 sm:max-w-none sm:px-4 sm:py-4">
                <div className="flex min-w-0 items-start gap-3">
                  {item.image?.src && (
                    <div className="relative hidden h-11 w-11 shrink-0 overflow-hidden rounded border border-gray-200 sm:block print:block">
                      <Image
                        src={item.image.src}
                        alt={item.image.alt || item.name}
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <p className="min-w-0 font-medium leading-snug text-gray-900">{item.name}</p>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-center text-gray-600 sm:px-4 sm:py-4">
                {item.sku || "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-900 sm:px-4 sm:py-4">
                {item.quantity}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-900 sm:px-4 sm:py-4">
                ${unit.toFixed(2)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold tabular-nums text-gray-900 sm:px-4 sm:py-4">
                ${lineTotal.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(OrderItemsInner);
