import { readWooMetaValue } from "@/lib/woo/orderMeta";

/** WooCommerce order meta key written by the MachShip integration plugin. */
export const MACHSHIP_TRACKING_TOKEN_META_KEY = "_wc_ns_machship_tracking_token";

const MACHSHIP_TRACKING_BASE_URL =
  "https://live.machship.com/trackingv2/#/consignments/";

/** Tokens are opaque MachShip consignment ids (base64url-style). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function normalizeMachshipTrackingToken(raw: unknown): string | null {
  if (raw == null) return null;
  const token = String(raw).trim();
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  return token;
}

export function extractMachshipTrackingTokenFromOrderMeta(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
): string | null {
  return normalizeMachshipTrackingToken(
    readWooMetaValue(meta, MACHSHIP_TRACKING_TOKEN_META_KEY),
  );
}

export function buildMachshipTrackingUrl(token: string): string {
  const normalized = normalizeMachshipTrackingToken(token);
  if (!normalized) return MACHSHIP_TRACKING_BASE_URL;
  return `${MACHSHIP_TRACKING_BASE_URL}${encodeURIComponent(normalized)}`;
}
