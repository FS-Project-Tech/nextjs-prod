/**
 * Typesense/Woo variation documents often store `name` as:
 *   "Parent title - val_123_456 · val_789 · each"
 * Strip the internal suffix for UI; real options belong in `attributes` after reindex.
 */
export function cleanSearchResultTitle(name: string): string {
  const n = String(name || "").trim();
  if (!n) return "";
  const sep = " - ";
  const i = n.indexOf(sep);
  if (i === -1) return n;
  const after = n.slice(i + sep.length);
  if (/val_[0-9_]+/i.test(after)) {
    return n.slice(0, i).trim();
  }
  return n;
}

/** Drop internal-looking attribute values from facet-style lines. */
export function cleanAttributeValuesForDisplay(values: string[]): string[] {
  return values.filter((v) => {
    const s = v.trim();
    if (!s) return false;
    if (/^val_[0-9_]+$/i.test(s)) return false;
    if (/val_[0-9_]+/i.test(s)) return false;
    return true;
  });
}

/**
 * "val_1 · val_2 · each" → drop val_* / stray "each" tokens; keep human-readable pieces.
 */
export function cleanVariationOptionLine(line: string): string {
  const s = String(line || "").trim();
  if (!s) return "";
  const parts = s
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/^val_[0-9_]+$/i.test(x))
    .filter((x) => !/val_[0-9_]+/i.test(x))
    .filter((x) => x.toLowerCase() !== "each");
  return parts.join(" · ").trim();
}
