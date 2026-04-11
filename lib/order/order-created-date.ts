/**
 * Parse WooCommerce / legacy order `date_created` strings and compare by calendar day
 * in the store timezone (default Australia/Sydney).
 */

const DEFAULT_STORE_TZ = "Australia/Sydney";

export function getWooStoreTimeZone(): string {
  return (
    process.env.WOO_STORE_TIMEZONE?.trim() ||
    process.env.NEXT_PUBLIC_STORE_TIMEZONE?.trim() ||
    DEFAULT_STORE_TZ
  );
}

/**
 * Parse order date to UTC milliseconds. Handles ISO, MySQL-style `YYYY-MM-DD HH:mm:ss`,
 * and date-only (uses UTC noon to reduce boundary skew).
 */
export function parseOrderCreatedMs(raw: string): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  let t = Date.parse(s);
  if (Number.isFinite(t)) return t;

  const withT = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  t = Date.parse(withT);
  if (Number.isFinite(t)) return t;

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    return Date.UTC(y, mo, d, 12, 0, 0, 0);
  }

  return null;
}

/**
 * Calendar `YYYY-MM-DD` for the order in the store timezone (for inclusive FROM/TO filters).
 */
export function orderDateYmdInStoreTz(dateCreated: string, timeZone = getWooStoreTimeZone()): string | null {
  const ms = parseOrderCreatedMs(dateCreated);
  if (ms == null) return null;
  const d = new Date(ms);
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return null;
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

export function orderCreatedMsForSort(dateCreated: string): number {
  return parseOrderCreatedMs(dateCreated) ?? 0;
}
