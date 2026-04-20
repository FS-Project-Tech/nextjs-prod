"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem } from "@/lib/types/cart";
import type { ComputedShippingRate } from "@/lib/shipping-rates-server";
import { formatShippingMethodCostDisplay } from "@/lib/shipping-rate-display";

export type ShippingOptionRate = {
  id: string;
  /** WooCommerce base shipping method id (not the composite `id`). */
  method_id: string;
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

type RatesApiJson = {
  rates?: ComputedShippingRate[];
  error?: string;
  molicareFreeShippingApplied?: boolean;
  notice?: string;
};

function toCustomerFriendlyShippingError(raw: string): string {
  const msg = String(raw || "").trim().toLowerCase();
  if (!msg) return "Shipping options are temporarily unavailable. Please check your address and try again.";
  if (msg.includes("missing required fields")) {
    return "Please Add your address to view available shipping.";
  }
  if (msg.includes("invalid subtotal")) {
    return "Your cart total needs to be updated before shipping methods can be shown.";
  }
  if (msg.includes("timeout")) {
    return "Shipping services are taking longer than expected. Please try again in a moment.";
  }
  return "Shipping options are temporarily unavailable. Please check your address and try again.";
}

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
    method_id: rate.method_id,
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
  items = [],
  selectedRateId,
  onRateChange,
  showLabel = true,
  className = "",
}: ShippingOptionsProps) {
  const [rates, setRates] = useState<ComputedShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const onRateChangeRef = useRef(onRateChange);
  onRateChangeRef.current = onRateChange;

  const cartProductIds = useMemo(() => {
    const ids = items
      .map((i) => i.productId)
      .filter((id): id is number => Number.isFinite(id) && id > 0);
    return [...new Set(ids)].sort((a, b) => a - b);
  }, [items]);

  const queryKey = useMemo(
    () => `${country}|${postcode}|${state}|${city}|${subtotal}|${cartProductIds.join(",")}`,
    [country, postcode, state, city, subtotal, cartProductIds],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);

    const usp = new URLSearchParams();
    usp.set("country", country || "AU");
    usp.set("state", state);
    usp.set("postcode", postcode);
    usp.set("city", city);
    usp.set("subtotal", String(Number.isFinite(subtotal) ? subtotal : 0));
    if (cartProductIds.length) {
      usp.set("productIds", cartProductIds.join(","));
    }

    void fetch(`/api/shipping/rates?${usp.toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = (await res.json()) as RatesApiJson;
        if (!res.ok) {
          const reason = typeof data.error === "string" ? data.error : "Failed to load shipping";
          throw new Error(toCustomerFriendlyShippingError(reason));
        }
        return {
          rates: data.rates ?? [],
          notice:
            data.molicareFreeShippingApplied && typeof data.notice === "string"
              ? data.notice
              : null,
        };
      })
      .then(({ rates: list, notice: nextNotice }) => {
        if (!cancelled) {
          setRates(Array.isArray(list) ? list : []);
          setNotice(nextNotice);
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
  }, [queryKey, country, postcode, state, city, subtotal, cartProductIds]);

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
        <p className="text-sm text-gray-600" role="status" aria-live="polite">
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
      {notice ? (
        <p className="mb-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          {notice}
        </p>
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
                  {formatShippingMethodCostDisplay(rate.method_id, rate.cost)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
