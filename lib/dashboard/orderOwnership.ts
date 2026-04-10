/**
 * Dashboard order actions (pay / cancel): strict ownership — Woo customer id OR billing email.
 * Avoids matching WP user id to Woo customer id (they can differ) and avoids using customer_id as an email fallback.
 */

export function orderBelongsToDashboardUser(params: {
  order: { customer_id?: unknown; billing?: { email?: string | null } | null };
  userEmail: string | undefined | null;
  wooCustomerId: number | null;
}): boolean {
  const billing = String(params.order.billing?.email ?? "")
    .trim()
    .toLowerCase();
  const userEmail = String(params.userEmail ?? "")
    .trim()
    .toLowerCase();
  const emailMatches =
    billing.length > 0 && userEmail.length > 0 && billing === userEmail;

  const orderCid = Number(params.order.customer_id ?? 0);
  const wid = params.wooCustomerId;
  const customerMatches =
    wid != null &&
    Number.isFinite(orderCid) &&
    orderCid > 0 &&
    orderCid === wid;

  return customerMatches || emailMatches;
}
