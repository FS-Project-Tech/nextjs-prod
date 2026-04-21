import type { CartItem } from "@/lib/types/cart";
import type { WooLineItem } from "@/services/woocommerce";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";

/** Line-item meta keys — visible label for Woo admin / emails that list item meta. */
export const DELIVERY_PLAN_META_CODE = "_joya_delivery_plan";
export const DELIVERY_PLAN_META_LABEL = "Delivery plan";

/** Order meta: human-readable block for packing / scheduling. */
export const DELIVERY_PLAN_SUMMARY_KEY = "delivery_plan_summary";
export const DELIVERY_PLAN_LINES_JSON_KEY = "_delivery_plan_lines_json";

export function enrichWooLineItemsWithDeliveryPlans(
  lines: WooLineItem[],
  cartItems: CartItem[] | undefined,
): WooLineItem[] {
  if (!cartItems?.length) return lines;

  return lines.map((line) => {
    const pid = Number(line.product_id);
    const vid = Number(line.variation_id ?? 0);
    const match = cartItems.find((c) => {
      const cv = c.variationId != null && c.variationId > 0 ? Number(c.variationId) : 0;
      return Number(c.productId) === pid && cv === vid;
    });

    const plan = match?.deliveryPlan;
    if (!plan || plan === "none") return line;

    const label = getDeliveryFrequencyLabel(plan);
    const meta_data = [
      ...(line.meta_data ?? []),
      { key: DELIVERY_PLAN_META_CODE, value: plan },
      { key: DELIVERY_PLAN_META_LABEL, value: label },
    ];
    return { ...line, meta_data };
  });
}

export function deliveryPlanOrderMetaRows(cartItems: CartItem[] | undefined): Array<{
  key: string;
  value: unknown;
}> {
  if (!cartItems?.length) return [];

  const withPlan = cartItems.filter((i) => i.deliveryPlan && i.deliveryPlan !== "none");
  if (withPlan.length === 0) return [];

  const summary = withPlan
    .map((i) => {
      const title = (i.name?.trim() || `Product #${i.productId}`).slice(0, 240);
      return `${title} ×${i.qty}: ${getDeliveryFrequencyLabel(i.deliveryPlan)}`;
    })
    .join("\n");

  const compact = withPlan.map((i) => ({
    product_id: i.productId,
    variation_id: i.variationId != null && i.variationId > 0 ? i.variationId : null,
    qty: i.qty,
    plan: i.deliveryPlan,
    label: getDeliveryFrequencyLabel(i.deliveryPlan),
  }));

  return [
    { key: DELIVERY_PLAN_SUMMARY_KEY, value: summary },
    { key: DELIVERY_PLAN_LINES_JSON_KEY, value: JSON.stringify(compact) },
  ];
}
