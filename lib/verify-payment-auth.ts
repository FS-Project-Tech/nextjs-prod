import "server-only";

import crypto from "crypto";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getWooOrder } from "@/lib/services/wooService";
import { timingSafeEqualHex } from "@/lib/timing-safe";

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function expectedVpSig(orderRef: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(String(orderRef), "utf8").digest("hex");
}

export type VerifyPaymentAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Logged-in users must own the Woo order. Guests must present vp_sig / paymentSig when VERIFY_PAYMENT_HMAC_SECRET is set.
 */
export async function assertVerifyPaymentAuthorized(
  req: NextRequest,
  ctx: { orderRef: string | null; paymentSig: string | null }
): Promise<VerifyPaymentAuthResult> {
  const hmacSecret = process.env.VERIFY_PAYMENT_HMAC_SECRET?.trim();
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  const jwt = nextAuthSecret
    ? await getToken({ req, secret: nextAuthSecret })
    : null;

  const wpToken = (jwt as { wpToken?: string } | null)?.wpToken;
  const hasWpSession = Boolean(wpToken);

  const subRaw = jwt?.sub != null ? String(jwt.sub) : "";
  const wpUserId =
    subRaw && /^\d+$/.test(subRaw) ? Number.parseInt(subRaw, 10) : null;
  const subEmail = subRaw.includes("@") ? normalizeEmail(subRaw) : "";
  const tokenEmail = jwt?.email ? normalizeEmail(String(jwt.email)) : "";

  if (!ctx.orderRef) {
    return { ok: true };
  }

  const sig = ctx.paymentSig?.trim() || null;

  if (hasWpSession) {
    let order: Record<string, unknown>;
    try {
      order = (await getWooOrder(ctx.orderRef)) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        status: 403,
        message: "Unable to verify order for this session.",
      };
    }

    const customerId = Number(order.customer_id ?? 0);
    const billing =
      order.billing && typeof order.billing === "object" && !Array.isArray(order.billing)
        ? (order.billing as { email?: string })
        : null;
    const billingEmail = billing?.email ? normalizeEmail(String(billing.email)) : "";

    const idMatch =
      wpUserId != null &&
      Number.isFinite(customerId) &&
      customerId > 0 &&
      customerId === wpUserId;

    const emailMatch =
      (tokenEmail && billingEmail && tokenEmail === billingEmail) ||
      (subEmail && billingEmail && subEmail === billingEmail);

    if (idMatch || emailMatch) {
      return { ok: true };
    }

    return {
      ok: false,
      status: 403,
      message: "Order does not match the signed-in account.",
    };
  }

  if (hmacSecret) {
    if (!sig || !timingSafeEqualHex(sig, expectedVpSig(ctx.orderRef, hmacSecret))) {
      return {
        ok: false,
        status: 401,
        message: "Payment verification proof missing or invalid.",
      };
    }
    return { ok: true };
  }

  return { ok: true };
}
