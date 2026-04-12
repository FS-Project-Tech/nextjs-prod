/** Best-effort parse of Woo REST order `total` (major units). */
export function readWooOrderTotal(order: unknown): string | null {
  if (order == null || typeof order !== "object") return null;
  const t = (order as Record<string, unknown>).total;
  if (typeof t === "string" && t.trim()) return t.trim();
  if (typeof t === "number" && Number.isFinite(t)) return String(t);
  return null;
}
