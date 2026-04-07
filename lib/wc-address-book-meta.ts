import "server-only";

import { unserialize } from "php-serialize";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";

/** Woo Address Book stores extra addresses as user meta: `wc_address_book_address_billing_a1`, etc. */
const WC_AB_KEY = /^wc_address_book_address_(billing|shipping)_(.+)$/i;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Read meta as a flat key → value map (object meta, array {key,value}[], or custom REST field).
 */
export function collectWpUserMetaKeyValues(user: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!user || typeof user !== "object") return out;
  const u = user as Record<string, unknown>;

  /** Optional: register_rest_field user `wc_address_book_meta` returning DB rows (see docs). */
  const abRest = u.wc_address_book_meta;
  if (Array.isArray(abRest)) {
    for (const row of abRest as { meta_key?: string; meta_value?: unknown }[]) {
      if (row?.meta_key) out[String(row.meta_key)] = row.meta_value;
    }
  }

  const meta = u.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      out[k] = v;
    }
  } else if (Array.isArray(meta)) {
    for (const row of meta as { key?: string; value?: unknown }[]) {
      if (row?.key != null) out[String(row.key)] = row.value;
    }
  }

  return out;
}

/** WooCommerce REST `customer.meta_data` often holds every Address Book row; WP `/users/me` may omit them. */
export function mergeWooCustomerMetaDataInto(
  target: Record<string, unknown>,
  customer: unknown
): void {
  const c = customer as { meta_data?: { key?: string; value?: unknown }[] } | null;
  const md = c?.meta_data;
  if (!Array.isArray(md)) return;
  for (const row of md) {
    const k = row?.key != null ? String(row.key) : "";
    if (!k) continue;
    if (k.startsWith("wc_address_book_address_")) {
      target[k] = row.value;
    }
  }
}

export function buildAddressBookMetaMap(wpUser: unknown, wcCustomer?: unknown): Record<string, unknown> {
  const map = collectWpUserMetaKeyValues(wpUser);
  mergeWooCustomerMetaDataInto(map, wcCustomer);
  return map;
}

function tryUnserializePhpAddressBlob(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  let s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!s.startsWith("a:")) return null;
  try {
    const data = unserialize(s) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    try {
      const unstripped = s.replace(/\\([\\"'])/g, "$1");
      const data2 = unserialize(unstripped) as unknown;
      if (data2 && typeof data2 === "object" && !Array.isArray(data2)) {
        return data2 as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isNonEmptyAddressBlock(obj: Record<string, unknown>): boolean {
  return (
    str(obj.address_1) !== "" ||
    str(obj.company) !== "" ||
    (str(obj.first_name) !== "" && str(obj.last_name) !== "") ||
    str(obj.first_name) !== ""
  );
}

/**
 * Parse serialized Address Book blobs from merged meta (WP user + optional WC customer meta_data).
 */
export function parseWcAddressBookMetaToAddresses(
  wpUser: unknown,
  wcCustomer?: unknown
): Record<string, unknown>[] {
  const meta =
    wcCustomer !== undefined
      ? buildAddressBookMetaMap(wpUser, wcCustomer)
      : collectWpUserMetaKeyValues(wpUser);
  const list: Record<string, unknown>[] = [];
  for (const [metaKey, rawVal] of Object.entries(meta)) {
    const m = metaKey.match(WC_AB_KEY);
    if (!m) continue;
    const type = m[1].toLowerCase() === "shipping" ? "shipping" : "billing";
    const suffix = m[2];
    const id = `wc-ab-${type}-${suffix}`;
    const parsed = tryUnserializePhpAddressBlob(rawVal);
    if (!parsed || !isNonEmptyAddressBlock(parsed)) continue;
    const label =
      str(parsed.address_nickname) ||
      str((parsed as { label?: unknown }).label) ||
      `${type} (${suffix})`;
    const row: Record<string, unknown> = {
      type,
      label,
      first_name: parsed.first_name ?? "",
      last_name: parsed.last_name ?? "",
      company: parsed.company ?? "",
      address_1: parsed.address_1 ?? "",
      address_2: parsed.address_2 ?? "",
      city: parsed.city ?? "",
      state: parsed.state ?? "",
      postcode: parsed.postcode ?? "",
      country: parsed.country ?? "",
      phone: parsed.phone ?? "",
      email: parsed.email ?? "",
    };
    list.push(normalizeAddressFromWp(row, id));
  }
  return list;
}
