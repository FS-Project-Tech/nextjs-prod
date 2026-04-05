"use client";

import { useState } from "react";
import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";
import { sanitizeHTML } from "@/lib/xss-sanitizer";

interface ProductInfoAccordionProps {
  product: WooCommerceProduct;
  variations: WooCommerceVariation[];
}

interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

export default function ProductInfoAccordion({ product, variations }: ProductInfoAccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(["description"]));

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const specRow = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-1 py-3.5 border-b border-gray-100 last:border-0 last:pb-0 first:pt-0">
      <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className="text-[15px] text-gray-900 text-right font-medium">{value}</span>
    </div>
  );

  const hasDimensions =
    product.dimensions &&
    (product.dimensions.length !== "" ||
      product.dimensions.width !== "" ||
      product.dimensions.height !== "");
  const dimensionsDisplay = hasDimensions
    ? `${product.dimensions?.length || "—"} × ${product.dimensions?.width || "—"} × ${product.dimensions?.height || "—"}`
    : null;

  const accordionItems: AccordionItem[] = [
    {
      id: "description",
      title: "Description",
      content: (
        <div
        className="product-description-content text-gray-700 text-[15px] leading-relaxed max-w-none
            [&_strong]:font-semibold [&_strong]:text-gray-900
            [&_p>strong]:block [&_p>strong]:mt-5 [&_p>strong]:mb-1.5 [&_p>strong]:text-base [&_p:first-child>strong]:mt-0
            [&_table_strong]:inline [&_table_strong]:my-0 [&_table_th_strong]:inline [&_table_td_strong]:inline
            [&_table_a]:text-teal-600 [&_table_a]:font-semibold [&_table_a]:underline
            [&_p]:mb-4 [&_p]:leading-relaxed
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-4 [&_ul]:space-y-2 [&_ul]:marker:text-teal-600
            [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-4 [&_ol]:space-y-2
            [&_li]:pl-0.5
            [&_a]:text-teal-600 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-teal-600/60 [&_a:hover]:decoration-teal-600 [&_a:hover]:text-teal-700
            [&_em]:text-gray-500 [&_em]:italic [&_em]:text-sm
            [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:first:mt-0
            [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm"
          dangerouslySetInnerHTML={{
            __html: sanitizeHTML(
              product.description || product.short_description || "No description available."
            ),
          }}
        />
      ),
    },
    {
      id: "specifications",
      title: "Specifications",
      content: (
        <div className="space-y-1">
          {product.sku && specRow("SKU", product.sku)}
          {product.weight && specRow("Weight", product.weight)}
          {dimensionsDisplay && specRow("Dimensions", dimensionsDisplay)}
          {product.stock_status &&
            specRow("Stock Status", <span className="capitalize">{product.stock_status}</span>)}
          {variations.length > 0 && (
            <div className="pt-4 mt-4 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                Available Variations
              </p>
              <ul className="list-disc list-inside space-y-2.5 pl-1 text-[15px] text-gray-700 marker:text-teal-500">
                {variations.slice(0, 5).map((variation) => (
                  <li key={variation.id} className="pl-0.5">
                    {variation.attributes
                      ?.map((attr) => `${attr.name}: ${attr.option}`)
                      .join(" · ")}
                    {variation.sku && (
                      <span className="text-gray-500"> (SKU: {variation.sku})</span>
                    )}
                  </li>
                ))}
                {variations.length > 5 && (
                  <li className="text-gray-500 italic">…and {variations.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3" suppressHydrationWarning>
      {accordionItems.map((item) => (
        <div
          key={item.id}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          id={`accordion-${item.id}`}
        >
          <button
            onClick={() => toggleItem(item.id)}
            className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset"
            aria-expanded={openItems.has(item.id)}
            aria-controls={`accordion-${item.id}`}
          >
            <span>{item.title}</span>
            <svg
              className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${
                openItems.has(item.id) ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {openItems.has(item.id) && (
            <div className="border-t border-gray-200 bg-gray-50/50 px-5 py-5 sm:px-6 sm:py-6">
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
