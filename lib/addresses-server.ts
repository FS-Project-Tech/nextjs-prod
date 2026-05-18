import "server-only";

import { createHash } from "crypto";
import { getWpBaseUrl } from "@/lib/auth";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";
import {
  getAddresses,
  getDeletedIds,
  removeDeletedId,
  upsertAddress,
} from "@/lib/addresses-memory-store";
import { loadFromFile } from "@/lib/addresses-file-store";
import { addressFingerprint } from "@/lib/wc-primary-addresses";

const SECONDARY_ADDRESS_KEYS = [
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
  "phone",
  "email",
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

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** GET .../customers/v1/addresses-secondary or .../addresses → { addresses: [...] } */
async function fetchWpAddressList(
  wpBase: string,
  path: string,
  token: string
): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${wpBase}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const arr = data?.addresses;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function getFallbackAddresses(userId: string): Record<string, unknown>[] {
  const fromMemory = getAddresses(userId);
  const fromFile = loadFromFile(userId);
  const fileList = fromFile?.addresses ?? [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const a of fileList) {
    const id = String(a.id ?? "");
    if (id) byId.set(id, a);
  }
  for (const a of fromMemory) {
    const id = String(a.id ?? "");
    if (id) byId.set(id, a);
  }
  return Array.from(byId.values());
}

function ensureRestAddressId(raw: Record<string, unknown>, index: number): string {
  const id = String(raw.id ?? "").trim();
  if (id) return id;
  const normPieces = [
    raw.type,
    raw.address_1,
    raw.postcode,
    raw.city,
    raw.first_name,
    raw.last_name,
    String(index),
  ];
  const h = createHash("sha256")
    .update(normPieces.map((x) => String(x ?? "")).join("|"))
    .digest("hex")
    .slice(0, 14);
  return `wp-${h}`;
}

/** Saved address book rows only (excludes Woo primary billing/shipping). */
export async function listSavedAddressBookEntries(
  wpToken: string,
  fileStoreKey: string
): Promise<Record<string, unknown>[]> {
  const wpBase = getWpBaseUrl();
  const deleted = getDeletedIds(fileStoreKey);
  const fallbackList = getFallbackAddresses(fileStoreKey);

  if (!wpBase || !wpToken.trim()) {
    return fallbackList
      .map((a, i) => normalizeAddressFromWp(a, ensureRestAddressId(a, i)))
      .filter((a) => !deleted.has(String(a.id).toLowerCase()));
  }

  const [bookList, secondaryList] = await Promise.all([
    fetchWpAddressList(wpBase, "/wp-json/customers/v1/addresses", wpToken),
    fetchWpAddressList(wpBase, "/wp-json/customers/v1/addresses-secondary", wpToken),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  let i = 0;
  const put = (raw: Record<string, unknown>) => {
    const id = ensureRestAddressId(raw, i++);
    byId.set(id, normalizeAddressFromWp(raw, id));
  };
  for (const a of bookList) put(a);
  for (const a of secondaryList) put(a);
  for (const a of fallbackList) {
    const id = String(a.id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, normalizeAddressFromWp(a, id));
  }

  return Array.from(byId.values()).filter(
    (a) => !deleted.has(String(a.id ?? "").toLowerCase())
  );
}

export function normalizeAddressPersistBody(body: unknown): Record<string, string> {
  const o =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  const type = o.type === "shipping" ? "shipping" : "billing";
  out.type = type;
  for (const key of SECONDARY_ADDRESS_KEYS) {
    if (key === "type") continue;
    const v = o[key];
    if (key === "ndis_approval" || key === "hcp_approval") {
      out[key] = v === true || v === "1" || v === 1 ? "1" : "0";
    } else {
      out[key] = v != null && typeof v === "string" ? v : String(v ?? "");
    }
  }
  return out;
}

export function isSubstantiveAddressFields(block: Record<string, unknown>): boolean {
  return (
    str(block.address_1) !== "" ||
    str(block.company) !== "" ||
    (str(block.first_name) !== "" && str(block.last_name) !== "") ||
    str(block.first_name) !== ""
  );
}

export function savedAddressBookHasFingerprint(
  existing: Record<string, unknown>[],
  type: "billing" | "shipping",
  candidate: Record<string, unknown>
): boolean {
  const fp = addressFingerprint({ ...candidate, type });
  return existing.some((a) => {
    const t = a.type === "shipping" ? "shipping" : "billing";
    if (t !== type) return false;
    return addressFingerprint(a) === fp;
  });
}

/**
 * POST to Address Book REST, then secondary slot, then local fallback (same order as dashboard API).
 */
export async function persistCustomerAddress(params: {
  wpToken: string;
  fileStoreKey: string;
  rawBody: Record<string, unknown>;
}): Promise<{ id: string; ok: boolean }> {
  const { wpToken, fileStoreKey, rawBody } = params;
  const body = normalizeAddressPersistBody(rawBody);
  const payloadForWp = { ...rawBody, ...body } as Record<string, unknown>;
  if (payloadForWp.type === undefined) payloadForWp.type = body.type;

  const wpBase = getWpBaseUrl();
  if (wpBase && wpToken.trim()) {
    const bookPost = await fetch(`${wpBase}/wp-json/customers/v1/addresses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${wpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadForWp),
      cache: "no-store",
    });

    if (bookPost.ok) {
      const result = await bookPost.json();
      const addr = (result.address ?? {}) as Record<string, unknown>;
      const id = String(addr.id ?? "");
      if (id) {
        upsertAddress(fileStoreKey, id, addr);
        removeDeletedId(fileStoreKey, id);
        return { id, ok: true };
      }
    }

    const secondaryPost = await fetch(`${wpBase}/wp-json/customers/v1/addresses-secondary`, {
      method: "POST",
      headers: { Authorization: `Bearer ${wpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadForWp),
      cache: "no-store",
    });

    if (secondaryPost.ok) {
      const result = await secondaryPost.json();
      const addr = (result.address ?? {}) as Record<string, unknown>;
      const id = String(addr.id ?? `local-${Date.now()}`);
      upsertAddress(fileStoreKey, id, addr);
      removeDeletedId(fileStoreKey, id);
      return { id, ok: true };
    }
  }

  const fallbackId = `local-${Date.now()}-${body.type}`;
  const fallbackAddr: Record<string, unknown> = {
    id: fallbackId,
    type: body.type,
    label: str(rawBody.label) || (body.type === "shipping" ? "Shipping" : "Billing"),
    ...payloadForWp,
  };
  upsertAddress(fileStoreKey, fallbackId, fallbackAddr);
  removeDeletedId(fileStoreKey, fallbackId);
  return { id: fallbackId, ok: true };
}
