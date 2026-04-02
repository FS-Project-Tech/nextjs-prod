"use client";

import { useEffect, useState } from "react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export type CheckoutPaymentMethod = {
  id: string;
  title: string;
  description?: string;
  enabled: boolean;
};

type PaymentMethodsProps<T extends FieldValues> = {
  control: Control<T>;
  name?: FieldPath<T>;
  disabled?: boolean;
};

export default function PaymentMethods<T extends FieldValues>({
  control,
  name = "paymentMethod" as FieldPath<T>,
  disabled = false,
}: PaymentMethodsProps<T>) {
  const [methods, setMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { field } = useController({ control, name });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checkout/payment-options", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled) return;
        const list: CheckoutPaymentMethod[] = Array.isArray(data.paymentMethods)
          ? data.paymentMethods
          : [];
        setMethods(list.filter((m) => m.enabled !== false));
        setFetchError(null);
      } catch {
        if (!cancelled) {
          setFetchError("Could not load payment methods.");
          setMethods([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || methods.length === 0) return;
    const valid = methods.some((m) => m.id === field.value);
    if (!valid) {
      field.onChange(methods[0].id);
    }
  }, [loading, methods, field.value, field.onChange]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading payment methods…</p>;
  }

  if (fetchError) {
    return <p className="text-sm text-rose-600">{fetchError}</p>;
  }

  if (methods.length === 0) {
    return (
      <p className="text-sm text-rose-600">
        No payment methods are available. Please contact support.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {methods.map((method) => (
        <label
          key={method.id}
          className="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-gray-50"
        >
          <input
            type="radio"
            name={String(name)}
            value={method.id}
            checked={field.value === method.id}
            onChange={() => field.onChange(method.id)}
            disabled={disabled}
            className="mt-1 h-4 w-4"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{method.title}</div>
            {method.description ? (
              <div className="mt-1 text-xs text-gray-500">{method.description}</div>
            ) : null}
          </div>
        </label>
      ))}
    </div>
  );
}
