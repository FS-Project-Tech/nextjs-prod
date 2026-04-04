import type { Session } from "next-auth";

function normalizeRoleSlug(role: string): string {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const ON_ACCOUNT_ROLE_SLUGS = new Set(["administrator", "ndis_approved"]);

export function canUseOnAccountPayment(session: Session | null): boolean {
  const roles = Array.isArray((session?.user as { roles?: string[] })?.roles)
    ? ((session?.user as { roles: string[] }).roles as string[])
    : [];
  const hasRole = roles.some((role) => ON_ACCOUNT_ROLE_SLUGS.has(normalizeRoleSlug(role)));
  const ndisMeta = (session?.user as { meta?: { ndis_approved?: boolean } })?.meta?.ndis_approved === true;
  return hasRole || ndisMeta;
}

export function checkoutPaymentMethodOptions(
  session: Session | null
): readonly ("cod" | "eway")[] {
  return canUseOnAccountPayment(session) ? (["cod", "eway"] as const) : (["eway"] as const);
}
