/**
 * AU-style calendar display (dd/mm/yyyy) for order timestamps in the UI.
 */

/**
 * Format an ISO timestamp or Date as dd/mm/yyyy (en-GB style, numeric).
 */
export function formatDateDdMmYyyy(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
