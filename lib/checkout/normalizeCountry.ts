export function normalizeCountryCode(raw: string): string {
  const trimmed = (raw || "").trim();
  return /^australia$/i.test(trimmed) ? "AU" : trimmed || "AU";
}
