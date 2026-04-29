"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DeliveryPlan } from "@/lib/types/cart";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";
import type { GlobalDeliveryPlanApiRow } from "@/lib/delivery-plan/global-delivery-plans-shared";

type DeliveryPlanLabelsContextValue = {
  /** When null, consumers use built-in defaults (same as before ACF). */
  plans: GlobalDeliveryPlanApiRow[] | null;
  /** Preferred render order for PDP buttons; when null, use built-in order. */
  order: DeliveryPlan[] | null;
  labelFor: (plan?: string | null) => string;
  loaded: boolean;
};

const DeliveryPlanLabelsContext = createContext<DeliveryPlanLabelsContextValue | null>(null);

export function DeliveryPlanLabelsProvider({ children }: { children: ReactNode }) {
  const [plans, setPlans] = useState<GlobalDeliveryPlanApiRow[] | null>(null);
  const [order, setOrder] = useState<DeliveryPlan[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/delivery-plan-labels", { cache: "no-store" });
        const data = (await res.json()) as {
          plans?: GlobalDeliveryPlanApiRow[] | null;
          order?: DeliveryPlan[] | null;
        };
        if (cancelled) return;
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
          setOrder(Array.isArray(data.order) && data.order.length > 0 ? data.order : null);
        } else {
          setPlans(null);
          setOrder(null);
        }
      } catch {
        if (!cancelled) {
          setPlans(null);
          setOrder(null);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    if (plans) {
      for (const p of plans) {
        m.set(p.key, p.label);
      }
    }
    return m;
  }, [plans]);

  const labelFor = useCallback(
    (plan?: string | null) => {
      const k = !plan || plan === "none" ? "none" : String(plan);
      const fromAcf = labelMap.get(k);
      if (fromAcf) return fromAcf;
      return getDeliveryFrequencyLabel(plan);
    },
    [labelMap],
  );

  const value = useMemo(
    () => ({ plans, order, labelFor, loaded }),
    [plans, order, labelFor, loaded],
  );

  return (
    <DeliveryPlanLabelsContext.Provider value={value}>{children}</DeliveryPlanLabelsContext.Provider>
  );
}

export function useDeliveryPlanLabels(): DeliveryPlanLabelsContextValue {
  const ctx = useContext(DeliveryPlanLabelsContext);
  if (!ctx) {
    return {
      plans: null,
      order: null,
      labelFor: getDeliveryFrequencyLabel,
      loaded: true,
    };
  }
  return ctx;
}
