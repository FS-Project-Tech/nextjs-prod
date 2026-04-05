import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/nextAuthOptions";
import wcAPI from "@/lib/woocommerce";
import type { CheckoutActor } from "@/types/checkout";

function norm(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function parseBooleanish(value: unknown): boolean {
  if (value === true) return true;
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseNumericId(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
  return n;
}

async function lookupNdisApprovedByEmail(email?: string): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await wcAPI.get("/customers", {
      params: { email, per_page: 1 },
    });
    const customer = Array.isArray(res.data) ? res.data[0] : undefined;
    const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
    const ndisMeta = meta.find((m: any) => norm(m?.key) === "ndis_approved");
    return parseBooleanish(ndisMeta?.value);
  } catch {
    return false;
  }
}

export type ResolveCheckoutActorOptions = {
  /**
   * When false (default), may call WooCommerce to read customer `ndis_approved` meta by email.
   * Set true to skip that HTTP round-trip (e.g. card checkout).
   */
  skipNdisCustomerLookup?: boolean;
};

export async function resolveCheckoutActor(
  options?: ResolveCheckoutActorOptions
): Promise<CheckoutActor> {
  const session = await getServerSession(authOptions);
  const user = (session?.user ?? {}) as any;
  const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
  const role = String(user.role || roles[0] || "").trim() || undefined;
  const email = typeof user.email === "string" ? user.email : undefined;
  const userId =
    parseNumericId(user?.id) ??
    parseNumericId(user?.userId) ??
    parseNumericId(user?.wpUserId) ??
    parseNumericId(user?.wcCustomerId) ??
    parseNumericId(user?.customerId);
  const fromMeta = parseBooleanish(user?.meta?.ndis_approved);
  const fromCustomerMeta = fromMeta
    ? true
    : options?.skipNdisCustomerLookup
      ? false
      : await lookupNdisApprovedByEmail(email);

  return {
    authenticated: Boolean(session?.user),
    userId,
    email,
    role,
    roles,
    ndisApproved: fromMeta || fromCustomerMeta,
  };
}
