export type ParsedUnit = {
  label: string;
  multiplier: number;
  type: string;
};

/**
 * Parses WooCommerce bulk unit tokens shaped as `"type:quantity"`.
 * - `1` → "{qty} Box"
 * - `2` → "{qty} Box/CTN"
 *
 * Rows with missing `:`, non-positive quantity, or unknown `type` are skipped.
 */
export function parseBulkUnits(values: string[] | null | undefined): ParsedUnit[] {
  if (values == null || values.length === 0) return [];

  const out: ParsedUnit[] = [];

  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;

    const colon = s.indexOf(":");
    if (colon <= 0 || colon >= s.length - 1) continue;

    const type = s.slice(0, colon).trim();
    const qtyPart = s.slice(colon + 1).trim();
    if (!type || !qtyPart) continue;
    if (type !== "1" && type !== "2") continue;

    const multiplier = parseInt(qtyPart, 10);
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;

    const label = type === "1" ? `${multiplier} Box` : `${multiplier} Box/CTN`;

    out.push({ type, multiplier, label });
  }

  return out;
}
