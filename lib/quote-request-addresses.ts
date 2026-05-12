import type { QuoteAddressSnapshot } from "@/lib/types/quote";

const SNAPSHOT_KEYS = [
  "first_name",
  "last_name",
  "company",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
  "country",
  "email",
  "phone",
] as const;

function rowHasStreet(a: Record<string, unknown>): boolean {
  return Boolean(
    String(a.address_1 ?? "").trim() ||
      String(a.city ?? "").trim() ||
      String(a.postcode ?? "").trim()
  );
}

export function addressRowToSnapshot(row: Record<string, unknown>): QuoteAddressSnapshot {
  const out: QuoteAddressSnapshot = {};
  for (const k of SNAPSHOT_KEYS) {
    const v = row[k];
    if (v == null || typeof v === "object") continue;
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return out;
}

/**
 * Prefer Woo primary rows (`default-billing` / `default-shipping`), else first typed row with a street/city/postcode.
 */
export function pickPrimaryQuoteAddresses(
  addresses: Record<string, unknown>[]
): { billing?: QuoteAddressSnapshot; shipping?: QuoteAddressSnapshot } {
  const billingRow =
    addresses.find((a) => String(a.id) === "default-billing" && rowHasStreet(a)) ??
    addresses.find((a) => a.type === "billing" && rowHasStreet(a)) ??
    null;

  const shippingRow =
    addresses.find((a) => String(a.id) === "default-shipping" && rowHasStreet(a)) ??
    addresses.find((a) => a.type === "shipping" && rowHasStreet(a)) ??
    null;

  const billing = billingRow ? addressRowToSnapshot(billingRow) : undefined;
  const shipping = shippingRow ? addressRowToSnapshot(shippingRow) : undefined;

  return {
    ...(Object.keys(billing ?? {}).length ? { billing } : {}),
    ...(Object.keys(shipping ?? {}).length ? { shipping } : {}),
  };
}

/** Whitelist POST body fields into a snapshot (server-side). */
export function parseQuoteAddressSnapshotFromBody(value: unknown): QuoteAddressSnapshot | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const out: QuoteAddressSnapshot = {};
  for (const k of SNAPSHOT_KEYS) {
    const v = o[k];
    if (v == null || typeof v === "object") continue;
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}
