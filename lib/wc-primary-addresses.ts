import "server-only";

import { getCustomerById, getCustomerData } from "@/lib/customer";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";
import { getWpBaseUrl } from "@/lib/auth";
import { parseWcAddressBookMetaToAddresses } from "@/lib/wc-address-book-meta";

export const WC_PRIMARY_BILLING_ID = "default-billing";
export const WC_PRIMARY_SHIPPING_ID = "default-shipping";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** Dedupe primary vs address-book rows (same type + street + postcode). */
export function addressFingerprint(a: Record<string, unknown>): string {
  const type = a.type === "shipping" ? "shipping" : "billing";
  return `${type}|${str(a.address_1).toLowerCase()}|${str(a.city).toLowerCase()}|${str(a.postcode).toLowerCase()}`;
}

/** Match Woo “nickname” row to primary even when city/state wording differs slightly (e.g. QLD vs Queensland). */
function looseAddressFingerprint(a: Record<string, unknown>): string {
  const type = a.type === "shipping" ? "shipping" : "billing";
  return `${type}|${str(a.address_1).toLowerCase()}|${str(a.postcode).toLowerCase()}`;
}

function enrichPrimaryLabelsFromAddressBook(
  primaries: Record<string, unknown>[],
  bookEntries: Record<string, unknown>[]
): void {
  for (const p of primaries) {
    const pid = String(p.id ?? "");
    if (pid !== WC_PRIMARY_BILLING_ID && pid !== WC_PRIMARY_SHIPPING_ID) continue;
    const lf = looseAddressFingerprint(p);
    const match = bookEntries.find(
      (b) => looseAddressFingerprint(b) === lf && String(b.type) === String(p.type)
    );
    const nick = match && str(match.label);
    if (nick) {
      p.label = nick;
    }
  }
}

function wcBlockNonEmpty(block: Record<string, unknown> | null | undefined): boolean {
  if (!block || typeof block !== "object") return false;
  return (
    str(block.address_1) !== "" ||
    str(block.company) !== "" ||
    (str(block.first_name) !== "" && str(block.last_name) !== "") ||
    str(block.first_name) !== ""
  );
}

const ADDRESS_FIELD_KEYS = [
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

/** Collect billing_* / shipping_* from REST user (meta object, array, or root-level fields). */
export function flattenWooAddressMetaFromWpUser(user: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!user || typeof user !== "object") return out;
  const u = user as Record<string, unknown>;

  for (const [k, v] of Object.entries(u)) {
    if (
      typeof k === "string" &&
      (k.startsWith("billing_") || k.startsWith("shipping_")) &&
      v != null &&
      typeof v !== "object"
    ) {
      out[k] = String(v).trim();
    }
  }

  const meta = u.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (
        (k.startsWith("billing_") || k.startsWith("shipping_")) &&
        v != null &&
        typeof v !== "object"
      ) {
        const s = String(v).trim();
        if (s !== "") out[k] = s;
      }
    }
  } else if (Array.isArray(meta)) {
    for (const row of meta as { key?: string; value?: unknown }[]) {
      const key = row?.key != null ? String(row.key) : "";
      if (!key || (!key.startsWith("billing_") && !key.startsWith("shipping_"))) continue;
      const s = String(row.value ?? "").trim();
      if (s !== "") out[key] = s;
    }
  }

  return out;
}

function metaFlatToAddressBlock(
  flat: Record<string, string>,
  kind: "billing" | "shipping"
): Record<string, unknown> {
  const prefix = `${kind}_`;
  const block: Record<string, unknown> = {};
  for (const k of ADDRESS_FIELD_KEYS) {
    const v = flat[prefix + k];
    if (v != null && String(v).trim() !== "") block[k] = v;
  }
  return block;
}

/**
 * WP Edit User “Customer billing/shipping address” is stored as user meta.
 * WooCommerce REST may not return a customer row (or returns empty billing) — merge meta into the shape `primaryAddressesFromCustomer` expects.
 */
export function mergeCustomerWithWpUserMeta(customer: unknown, wpUser: unknown): unknown {
  const flat = flattenWooAddressMetaFromWpUser(wpUser);
  const metaBilling = metaFlatToAddressBlock(flat, "billing");
  const metaShipping = metaFlatToAddressBlock(flat, "shipping");

  const c = customer as {
    billing?: Record<string, unknown>;
    shipping?: Record<string, unknown>;
    meta_data?: unknown;
  } | null;

  if (!c || typeof c !== "object") {
    if (!wcBlockNonEmpty(metaBilling) && !wcBlockNonEmpty(metaShipping)) return null;
    return {
      billing: metaBilling,
      shipping: metaShipping,
      meta_data: [],
    };
  }

  const bill = { ...(c.billing && typeof c.billing === "object" ? c.billing : {}) };
  const ship = { ...(c.shipping && typeof c.shipping === "object" ? c.shipping : {}) };

  if (!wcBlockNonEmpty(bill) && wcBlockNonEmpty(metaBilling)) {
    Object.assign(bill, metaBilling);
  }
  if (!wcBlockNonEmpty(ship) && wcBlockNonEmpty(metaShipping)) {
    Object.assign(ship, metaShipping);
  }

  return { ...c, billing: bill, shipping: ship };
}

async function fetchWpUserJsonForAddresses(token: string): Promise<unknown | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let res = await fetch(`${wpBase}/wp-json/wp/v2/users/me?context=edit`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    res = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, { headers, cache: "no-store" });
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function metaLabel(customer: unknown, keys: string[]): string | undefined {
  const c = customer as { meta_data?: { key?: string; value?: unknown }[] };
  const meta = c?.meta_data;
  if (!Array.isArray(meta)) return undefined;
  for (const key of keys) {
    const hit = meta.find((m) => m.key === key);
    if (hit?.value != null && String(hit.value).trim()) return String(hit.value).trim();
  }
  return undefined;
}

/** WooCommerce core customer `billing` / `shipping` as dashboard rows (matches WP “default” addresses). */
export function primaryAddressesFromCustomer(customer: unknown): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = [];
  const c = customer as { billing?: Record<string, unknown>; shipping?: Record<string, unknown> };
  const b = c?.billing;
  if (wcBlockNonEmpty(b)) {
    const label =
      metaLabel(customer, [
        "billing_address_name",
        "wc_address_book_billing_address_name",
        "billing_address_label",
      ]) || "Primary billing";
    list.push(
      normalizeAddressFromWp({ ...b, type: "billing", label }, WC_PRIMARY_BILLING_ID)
    );
  }
  const s = c?.shipping;
  if (wcBlockNonEmpty(s)) {
    const label =
      metaLabel(customer, [
        "shipping_address_name",
        "wc_address_book_shipping_address_name",
        "shipping_address_label",
      ]) || "Primary shipping";
    list.push(
      normalizeAddressFromWp({ ...s, type: "shipping", label }, WC_PRIMARY_SHIPPING_ID)
    );
  }
  return list;
}

/**
 * Prepend WC default billing/shipping and remove duplicate rows already in the address book.
 */
export async function mergeAddressListWithWooPrimaries(
  bookAddresses: Record<string, unknown>[],
  userEmail: string | null | undefined,
  token: string
): Promise<Record<string, unknown>[]> {
  const wpUser = await fetchWpUserJsonForAddresses(token);
  const emailFromWp =
    wpUser && typeof wpUser === "object" && "email" in wpUser
      ? String((wpUser as { email?: string }).email ?? "").trim()
      : "";
  const email = String(userEmail ?? "").trim() || emailFromWp;

  let customerRaw: unknown = null;
  if (email) {
    customerRaw = await getCustomerData(email, token);
    if (
      !customerRaw &&
      wpUser &&
      typeof (wpUser as { id?: unknown }).id === "number"
    ) {
      customerRaw = await getCustomerById((wpUser as { id: number }).id, token);
    }
  }

  /** Include every `wc_address_book_address_*` from WC `meta_data` (not only WP REST user meta). */
  const fromAddressBookMeta = parseWcAddressBookMetaToAddresses(wpUser, customerRaw ?? undefined);
  const bookFp = new Set(bookAddresses.map(addressFingerprint));
  const abMetaExtra = fromAddressBookMeta.filter(
    (a) => !bookFp.has(addressFingerprint(a))
  );
  let combined = [...abMetaExtra, ...bookAddresses];

  if (!email) {
    return combined;
  }

  try {
    const customer = mergeCustomerWithWpUserMeta(customerRaw, wpUser);
    if (!customer) return combined;

    const primaries = primaryAddressesFromCustomer(customer);
    enrichPrimaryLabelsFromAddressBook(primaries, fromAddressBookMeta);
    if (primaries.length === 0) return combined;

    const rest = combined.filter((a) => {
      const id = String(a.id ?? "").toLowerCase();
      if (id === WC_PRIMARY_BILLING_ID || id === WC_PRIMARY_SHIPPING_ID) return false;
      for (const p of primaries) {
        if (String(p.type) !== String(a.type)) continue;
        if (looseAddressFingerprint(a) === looseAddressFingerprint(p)) return false;
      }
      return true;
    });
    return [...primaries, ...rest];
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[addresses] mergeAddressListWithWooPrimaries:", e);
    }
    return combined;
  }
}
