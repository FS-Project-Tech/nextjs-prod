export function readWooMetaValue(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
  key: string,
): string | null {
  if (!Array.isArray(meta)) return null;
  const row = meta.find((m) => String(m?.key || "") === key);
  if (row == null) return null;
  const v = row.value;
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  return s || null;
}

/**
 * Replace/add keys from `additions`; keep other existing meta rows (Woo PUT replaces the whole list).
 */
export function mergeWooOrderMetaByKey(
  existing: Array<{ id?: number; key: string; value: unknown }> | undefined,
  additions: Array<{ key: string; value: unknown }>,
): Array<{ id?: number; key: string; value: unknown }> {
  const addKeys = new Set(additions.map((a) => String(a.key)));
  const base = (existing ?? []).filter((row) => row?.key && !addKeys.has(String(row.key)));
  return [...base, ...additions.map((a) => ({ key: a.key, value: a.value }))];
}
