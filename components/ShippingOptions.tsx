"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem } from "@/lib/types/cart";
import type { ComputedShippingRate } from "@/lib/shipping-rates-server";
import { formatPrice } from "@/lib/format-utils";

export type ShippingOptionRate = {
  id: string;
  label: string;
  cost: number;
  description?: string;
};

export type ShippingOptionsProps = {
  country: string;
  /** Legacy display hint from useShippingAddress (optional). */
  zone?: string;
  postcode?: string;
  state?: string;
  city?: string;
  subtotal: number;
  items?: CartItem[];
  selectedRateId?: string;
  onRateChange: (rateId: string, rate: ShippingOptionRate) => void;
  showLabel?: boolean;
  className?: string;
};

type RatesApiJson = { rates?: ComputedShippingRate[]; error?: string };

/** Woo flat_rate settings often store HTML; show plain text in checkout. */
function stripHtmlToPlainText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toOption(rate: ComputedShippingRate): ShippingOptionRate {
  return {
    id: rate.id,
    label: rate.label,
    cost: rate.cost,
    description: rate.description,
  };
}

export default function ShippingOptions({
  country,
  postcode = "",
  state = "",
  city = "",
  subtotal,
  selectedRateId,
  onRateChange,
  showLabel = true,
  className = "",
}: ShippingOptionsProps) {
  const [rates, setRates] = useState<ComputedShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onRateChangeRef = useRef(onRateChange);
  onRateChangeRef.current = onRateChange;

  const queryKey = useMemo(
    () => `${country}|${postcode}|${state}|${city}|${subtotal}`,
    [country, postcode, state, city, subtotal],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const usp = new URLSearchParams();
    usp.set("country", country || "AU");
    usp.set("state", state);
    usp.set("postcode", postcode);
    usp.set("city", city);
    usp.set("subtotal", String(Number.isFinite(subtotal) ? subtotal : 0));

    void fetch(`/api/shipping/rates?${usp.toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = (await res.json()) as RatesApiJson;
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Failed to load shipping");
        }
        return data.rates ?? [];
      })
      .then((list) => {
        if (!cancelled) {
          setRates(Array.isArray(list) ? list : []);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Shipping unavailable");
          setRates([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queryKey, country, postcode, state, city, subtotal]);

  useEffect(() => {
    if (loading || rates.length === 0) return;
    const hasSelection =
      Boolean(selectedRateId) && rates.some((r) => String(r.id) === String(selectedRateId));
    if (hasSelection) return;

    const first = rates[0];
    onRateChangeRef.current(String(first.id), toOption(first));
  }, [loading, rates, selectedRateId, queryKey]);

  const effectiveId =
    selectedRateId && rates.some((r) => String(r.id) === String(selectedRateId))
      ? String(selectedRateId)
      : rates[0]
        ? String(rates[0].id)
        : "";

  if (loading) {
    return (
      <div className={className}>
        {showLabel ? <p className="mb-2 text-sm text-gray-600">Loading shipping options…</p> : null}
        <div className="h-10 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (rates.length === 0) {
    return (
      <div className={className}>
        <p className="text-sm text-gray-600">No shipping methods available for this address.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {showLabel ? (
        <p className="mb-2 text-sm font-medium text-gray-700">Shipping method</p>
      ) : null}
      <ul className="space-y-2">
        {rates.map((rate) => {
          const id = String(rate.id);
          const selected = effectiveId === id;
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="headless-shipping-rate"
                  value={id}
                  checked={selected}
                  onChange={() => onRateChange(id, toOption(rate))}
                  className="mt-1 h-4 w-4 border-gray-300 text-gray-900"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">{rate.label}</span>
                  {rate.description ? (
                    <span className="mt-0.5 block text-xs text-gray-600">
                      {stripHtmlToPlainText(rate.description)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold text-gray-900">
                  {formatPrice(rate.cost)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
