"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedUnit } from "@/lib/utils/bulkUnits";

export type UnitSelectorProduct = {
  id: number;
  type?: string;
  bulk_units?: ParsedUnit[] | null;
};

export type UnitSelectorVariation = {
  id?: number;
  bulk_units?: ParsedUnit[] | null;
};

export type UnitSelectorProps = {
  product: UnitSelectorProduct;
  selectedVariation?: UnitSelectorVariation | null;
  /** Fired with `null` when the controlling variation (or product) changes and selection is cleared. */
  onSelect: (unit: ParsedUnit | null) => void;
};

function unitKey(u: ParsedUnit): string {
  return `${u.type}:${u.multiplier}:${u.label}`;
}

/**
 * Bulk unit chips for PDP: simple products use `product.bulk_units`;
 * variable products use `selectedVariation.bulk_units` (hidden until a variation is chosen).
 */
export default function UnitSelector({
  product,
  selectedVariation,
  onSelect,
}: UnitSelectorProps) {
  const isVariable = product.type === "variable";

  const units = useMemo((): ParsedUnit[] => {
    if (isVariable) {
      if (selectedVariation == null) return [];
      const list = selectedVariation.bulk_units;
      return Array.isArray(list) ? list : [];
    }
    const list = product.bulk_units;
    return Array.isArray(list) ? list : [];
  }, [isVariable, product.bulk_units, selectedVariation]);

  const variationId =
    isVariable &&
    selectedVariation?.id != null &&
    Number.isFinite(selectedVariation.id)
      ? selectedVariation.id
      : null;

  const [selected, setSelected] = useState<ParsedUnit | null>(null);
  const prevProductIdRef = useRef(product.id);
  const prevVariationIdRef = useRef<number | null>(null);

  useEffect(() => {
    const productChanged = prevProductIdRef.current !== product.id;
    if (productChanged) {
      prevProductIdRef.current = product.id;
      prevVariationIdRef.current = null;
      setSelected(null);
      onSelect(null);
      return;
    }

    if (!isVariable) return;

    const prev = prevVariationIdRef.current;
    if (prev !== null && variationId !== prev) {
      setSelected(null);
      onSelect(null);
    }
    prevVariationIdRef.current = variationId;
  }, [product.id, isVariable, variationId, onSelect]);

  if (units.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unit</p>
      <div
        className="flex flex-wrap gap-2"
        role="listbox"
        aria-label="Select unit"
      >
        {units.map((unit) => {
          const active = selected != null && unitKey(selected) === unitKey(unit);
          return (
            <button
              key={unitKey(unit)}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                setSelected(unit);
                onSelect(unit);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              {unit.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
