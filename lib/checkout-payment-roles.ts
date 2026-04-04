/**
 * Role rules for Pay on Account (COD / offline gateways).
 * Always re-check on the server — never trust the client.
 */

import { getAuthToken, getUserData } from "@/lib/auth-server";

export const PAY_ON_ACCOUNT_ROLE_SLUGS = new Set(["administrator", "ndis_approved"]);

/** Methods that normal customers must never use (validated on /api/checkout) */
export const PAY_ON_ACCOUNT_PAYMENT_METHODS = new Set(["cod", "bacs", "bank_transfer", "cheque"]);

export function normalizeRoleSlug(role: string): string {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function userCanUsePayOnAccount(roles: string[] | undefined | null): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => PAY_ON_ACCOUNT_ROLE_SLUGS.has(normalizeRoleSlug(r)));
}

/** Server-only: enforce Pay on Account for COD/BACS/etc. */
export async function assertPayOnAccountAllowed(): Promise<
  { ok: true; roles: string[] } | { ok: false; error: string }
> {
  const token = await getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: "You must be signed in to use Pay on Account.",
    };
  }
  const user = await getUserData(token);
  const roles = user?.roles ?? [];
  if (!userCanUsePayOnAccount(roles)) {
    return {
      ok: false,
      error: "This payment method is not available for your account.",
    };
  }
  return { ok: true, roles };
}
