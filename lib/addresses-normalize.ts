//D:\nextjs\lib\addresses-normalize.ts

/**
 * Normalize address objects from WordPress to the canonical shape the app expects.
 * Use for both Address Book (primary) and secondary (billing2/shipping2) so
 * data fetching and mapping are consistent.
 */

export const CANONICAL_ADDRESS_KEYS = [
  "type",
  "label",
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

const NDIS_HCP_KEYS = [
  "ndis_participant_name",
  "ndis_number",
  "ndis_dob",
  "ndis_funding_type",
  "ndis_approval",
  "ndis_invoice_email",
  "hcp_participant_name",
  "hcp_number",
  "hcp_provider_email",
  "hcp_approval",
] as const;

/**
 * Normalize any address from WordPress to the same shape the app expects.
 * Accepts primary-style keys (billing_first_name, shipping_address_1) and
 * secondary-style keys (first_name, address_1) and returns canonical keys only.
 * NDIS/HCP keys are preserved so they are stored and shown in the address form.
 */
export function normalizeAddressFromWp(
  a: Record<string, unknown>,
  id: string
): Record<string, unknown> {
  const type = (a.type === "shipping" ? "shipping" : "billing") as "billing" | "shipping";
  const prefix = type === "shipping" ? "shipping_" : "billing_";
  const out: Record<string, unknown> = { id, type };
  const keys = [
    "label",
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
  for (const key of keys) {
    const v = a[key] ?? a[prefix + key];
    out[key] = v === undefined || v === null ? "" : v;
  }
  for (const key of NDIS_HCP_KEYS) {
    const v = a[key] ?? a[prefix + key];
    if (v !== undefined && v !== null) {
      out[key] =
        key === "ndis_approval" || key === "hcp_approval"
          ? Boolean(v === true || v === "1" || v === 1)
          : v;
    } else {
      out[key] = key === "ndis_approval" || key === "hcp_approval" ? false : "";
    }
  }
  return out;
}
