"use client";

import { useState, useMemo } from "react";
import PriceBlock from "@/components/product/PriceBlock";
import VariationSelector from "@/components/product/VariationSelector";

export default function ProductDetailClient({ product }: any) {
  const [selected, setSelected] = useState<any>({});
  const [quantity, setQuantity] = useState(1);

  // ⚡ FAST lookup (no loops)
  const matchedVariation = useMemo(() => {
    const key = JSON.stringify(selected);
    return product.variationMap[key];
  }, [selected, product.variationMap]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{product.name}</h1>

      {/* PRICE */}
      <PriceBlock product={product} variation={matchedVariation} />

      {/* VARIATIONS */}
      <VariationSelector
        attributes={product.attributes}
        selected={selected}
        onChange={setSelected}
      />

      {/* QUANTITY */}
      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        className="border px-3 py-2 w-20"
      />

      {/* ADD TO CART */}
      <button className="bg-teal-600 text-white px-6 py-3 rounded">Add to Cart</button>
    </div>
  );
}
