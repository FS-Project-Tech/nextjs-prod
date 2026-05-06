import type { CheckoutActor } from "@/types/checkout";

export function wooStoreCurrency(): string {
  return (
    process.env.WOO_STORE_CURRENCY?.trim() ||
    process.env.NEXT_PUBLIC_WOO_CURRENCY?.trim() ||
    "AUD"
  );
}

export function deriveCustomerPricingKey(actor: CheckoutActor): string {
  if (!actor.authenticated || actor.userId == null || actor.userId <= 0) {
    return "guest";
  }
  const roles = [...actor.roles]
    .map((r) => String(r || "").trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (roles.length > 0) return roles.join("|");
  return `user:${actor.userId}`;
}
