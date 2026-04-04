"use client";

import { useMemo } from "react";

export default function PriceBlock({ product, variation }: any) {
  const data = useMemo(() => {
    const price = variation?.price ?? product.price;
    const regular = variation?.regular_price ?? product.regular_price;

    const isOnSale = regular > price;

    return {
      price,
      regular,
      isOnSale,
      savings: isOnSale ? (regular - price).toFixed(2) : null,
    };
  }, [product, variation]);

  return (
    <div>
      {data.isOnSale && <div className="text-sm line-through text-gray-500">${data.regular}</div>}

      <div className="text-2xl font-semibold text-green-700">${data.price}</div>

      {data.savings && <div className="text-sm text-green-600">Save ${data.savings}</div>}
    </div>
  );
}
