/**
 * Fallback store for user addresses when WordPress custom endpoint is not available.
 * In-memory + file persistence so addresses survive navigation and server restarts.
 */

import { loadFromFile, saveToFile } from "./addresses-file-store";

const KNOWN_KEYS = [
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

function normalizeAddress(input: Record<string, unknown>, id?: string): Record<string, unknown> {
  const out: Record<string, unknown> = { id: id ?? (input.id as string) };
  for (const key of KNOWN_KEYS) {
    const v = input[key];
    out[key] = v === undefined || v === null ? "" : v;
  }
  return out;
}

const store = new Map<string, Array<Record<string, unknown>>>();
const deletedIds = new Map<string, Set<string>>();

/** Persist current in-memory state for this user to file so it survives navigation/restart */
function persist(userId: string): void {
  try {
    const list = store.get(userId) || [];
    const set = deletedIds.get(userId);
    saveToFile(userId, {
      addresses: list,
      deletedIds: set ? Array.from(set) : [],
    });
  } catch {
    // ignore
  }
}

export function removeDeletedId(userId: string, id: string): void {
  loadIntoMemoryIfNeeded(userId);
  const set = deletedIds.get(userId);
  if (set) {
    set.delete(String(id).toLowerCase());
    persist(userId);
  }
}

/** Load from file into memory if memory is empty (e.g. different process or after restart) */
function loadIntoMemoryIfNeeded(userId: string): void {
  if (store.has(userId)) return;
  const data = loadFromFile(userId);
  if (data) {
    store.set(userId, data.addresses);
    if (data.deletedIds.length > 0) {
      deletedIds.set(userId, new Set(data.deletedIds.map((id) => String(id).toLowerCase())));
    }
  }
}

export function getAddresses(userId: string): Record<string, unknown>[] {
  loadIntoMemoryIfNeeded(userId);
  return store.get(userId) || [];
}

/** Ids the user has deleted (so we hide them even if WordPress still returns them). Case-insensitive. */
export function getDeletedIds(userId: string): Set<string> {
  loadIntoMemoryIfNeeded(userId);
  return deletedIds.get(userId) || new Set();
}

export function addDeletedId(userId: string, id: string): void {
  loadIntoMemoryIfNeeded(userId);
  let set = deletedIds.get(userId);
  if (!set) {
    set = new Set();
    deletedIds.set(userId, set);
  }
  set.add(String(id).toLowerCase());
  persist(userId);
}

export function setAddresses(userId: string, list: Record<string, unknown>[]): void {
  store.set(userId, list);
  persist(userId);
}

export function addAddress(
  userId: string,
  address: Record<string, unknown>
): Record<string, unknown> {
  const list = getAddresses(userId);
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newAddress = normalizeAddress({ ...address, id }, id);
  list.push(newAddress);
  store.set(userId, list);
  persist(userId);
  return newAddress;
}

/** Find index by id (case-insensitive so "Local-..." matches "local-...") */
function findIndexById(list: Record<string, unknown>[], id: string): number {
  const idLower = String(id).toLowerCase();
  return list.findIndex((a) => String(a.id).toLowerCase() === idLower);
}

export function updateAddress(
  userId: string,
  id: string,
  updates: Record<string, unknown>
): Record<string, unknown> | null {
  const list = getAddresses(userId);
  const idx = findIndexById(list, id);
  if (idx === -1) return null;
  const existing = list[idx] as Record<string, unknown>;
  const merged: Record<string, unknown> = { id: existing.id };
  for (const key of KNOWN_KEYS) {
    const fromUpdate = updates[key];
    merged[key] =
      fromUpdate !== undefined && fromUpdate !== null ? fromUpdate : (existing[key] ?? "");
  }
  list[idx] = merged;
  persist(userId);
  return list[idx];
}

/** Upsert: update if id exists (case-insensitive), otherwise add with this id */
export function upsertAddress(
  userId: string,
  id: string,
  address: Record<string, unknown>
): Record<string, unknown> {
  const list = getAddresses(userId);
  const normalized = normalizeAddress({ ...address, id }, id);
  const idx = findIndexById(list, id);
  if (idx >= 0) {
    list[idx] = { ...normalized, id: list[idx].id };
    persist(userId);
    return list[idx];
  }
  list.push(normalized);
  store.set(userId, list);
  persist(userId);
  return normalized;
}

export function deleteAddress(userId: string, id: string): boolean {
  const list = getAddresses(userId);
  const idx = findIndexById(list, id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  store.set(userId, list);
  addDeletedId(userId, id); // also calls persist
  return true;
}
