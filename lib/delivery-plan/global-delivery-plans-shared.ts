import type { DeliveryPlan } from "@/lib/types/cart";

export type GlobalDeliveryPlanApiRow = { key: string; label: string };

const VALID: Set<string> = new Set(["none", "7", "14", "30"]);

export function parseGlobalDeliveryPlansPayload(raw: unknown): GlobalDeliveryPlanApiRow[] | null {
  if (!raw || typeof raw !== "object") return null;
  const plans = (raw as { plans?: unknown }).plans;
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const out: GlobalDeliveryPlanApiRow[] = [];
  for (const row of plans) {
    if (!row || typeof row !== "object") continue;
    const key = String((row as { key?: unknown }).key || "").trim();
    const label = String((row as { label?: unknown }).label || "").trim();
    if (!VALID.has(key) || !label) continue;
    out.push({ key, label });
  }
  return out.length > 0 ? out : null;
}

export function toDeliveryPlanOrder(rows: GlobalDeliveryPlanApiRow[]): DeliveryPlan[] {
  const order: DeliveryPlan[] = [];
  for (const r of rows) {
    if (VALID.has(r.key) && !order.includes(r.key as DeliveryPlan)) {
      order.push(r.key as DeliveryPlan);
    }
  }
  return order;
}
