"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeString } from "@/lib/sanitize";

interface ShippingRate {
  id: string;
  label: string;
  cost: number;
  description?: string;
  minimum_amount?: number;
  maximum_amount?: number;
  requires?: string;
}

interface ShippingOptionsProps {
  country?: string;
  zone?: string;
  postcode?: string;
  state?: string;
  city?: string;
  selectedRateId?: string;
  onRateChange?: (rateId: string, rate: ShippingRate) => void;
  className?: string;
  showLabel?: boolean;
  subtotal?: number; // Cart subtotal for rule-based filtering
  items?: Array<{ id: string; productId: number; price: string; qty: number; [key: string]: any }>; // Cart items for filtering
}

export default function ShippingOptions({
  country = "AU",
  zone,
  postcode,
  state,
  city,
  selectedRateId,
  onRateChange,
  className = "",
  showLabel = true,
  subtotal = 0,
  items = [],
}: ShippingOptionsProps) {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState<string>("");
  const serializedItems = useMemo(() => JSON.stringify(items ?? []), [items]);
  const onRateChangeRef = useRef(onRateChange);
  onRateChangeRef.current = onRateChange;

  // Use controlled or internal state
  const currentSelectedId = selectedRateId !== undefined ? selectedRateId : internalSelectedId;

  useEffect(() => {
    if (!country) return;

    let cancelled = false;
    (async () => {
      try {
        setLoadingRates(true);
        const params = new URLSearchParams();
        if (country) params.set("country", country);
        if (zone) params.set("zone", zone);
        if (postcode) params.set("postcode", postcode);
        if (state) params.set("state", state);
        if (city) params.set("city", city);
        params.set("subtotal", String(subtotal ?? 0));
        if (items.length > 0) {
          params.set("items", serializedItems);
        }

        const res = await fetch(`/api/shipping/rates?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        const fetched: ShippingRate[] = Array.isArray(json.rates) ? json.rates : [];

        if (!cancelled) {
          setRates(fetched);
          if (fetched.length > 0) {
            const firstId = fetched[0].id;
            if (selectedRateId === undefined) {
              setInternalSelectedId(firstId);
            }
            const cb = onRateChangeRef.current;
            if (cb && fetched[0]) {
              cb(firstId, fetched[0]);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setRates([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingRates(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [country, zone, postcode, state, city, subtotal, serializedItems]);

  const handleRateChange = (rate: ShippingRate) => {
    if (selectedRateId === undefined) {
      setInternalSelectedId(rate.id);
    }
    if (onRateChange) {
      onRateChange(rate.id, rate);
    }
  };

  return (
    <div className={className}>
      {showLabel && (
        <label className="block text-sm font-semibold text-gray-900 mb-2">Shipping Options</label>
      )}
      {loadingRates && (
        <div
          className="flex items-center gap-2 py-2 text-sm text-gray-800"
          role="status"
          aria-live="polite"
        >
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>Loading shipping rates…</span>
        </div>
      )}
      {!loadingRates && rates.length === 0 && (
        <div className="py-2 text-sm text-gray-800" role="status">
          No shipping rates found for this address.
        </div>
      )}
      <div className="space-y-2">
        {rates.map((r) => {
          const safeLabel = sanitizeString(r.label || "");
          const safeDescription = r.description ? sanitizeString(r.description) : "";
          const isSelected = currentSelectedId === r.id;
          const isFree = Number(r.cost) === 0;
          return (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white/60 p-3 transition-all ${
                isSelected
                  ? "border-teal-500 shadow-sm bg-white"
                  : "border-gray-200 hover:border-teal-200"
              }`}
            >
              <input
                type="radio"
                name="shipping-rate"
                value={r.id}
                checked={isSelected}
                onChange={() => handleRateChange(r)}
                className="h-4 w-4 text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                aria-label={`${safeLabel || "Shipping option"}, ${isFree ? "free" : `$${r.cost.toFixed(2)}`}`}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-gray-900">
                    {safeLabel || "Shipping option"}
                  </div>
                  {isFree && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      Free
                    </span>
                  )}
                </div>
                {safeDescription && (
                  <div className="text-xs text-gray-500 mt-0.5">{safeDescription}</div>
                )}
                {r.minimum_amount && (
                  <div className="text-xs text-gray-600 mt-0.5">
                    Min. order: ${r.minimum_amount.toFixed(2)}
                  </div>
                )}
              </div>
              <div className="text-sm font-bold text-gray-900">
                {isFree ? "Free" : `$${r.cost.toFixed(2)}`}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
