/**
 * Multi-SKU paste / comma-separated lookup for Typesense search.
 * - Split on commas / semicolons / newlines — **not** spaces — so SKUs like `NC VAN LF` stay one token.
 * - Allow spaces inside a SKU segment (warehouse / legacy formats).
 */

/** URL / client / API: long comma-separated SKU lists exceed 200–500 chars. */
export const MAX_SKU_SEARCH_QUERY_LEN = 8000;

const SEGMENT_MAX = 180;
const MIN_EXACT_SINGLE_SKU_LENGTH = 6;
const SKU_TOKEN_PATTERN = /^[A-Za-z0-9._/\s-]+$/;

export function parseSkuTokens(rawQuery: string): string[] {
  const raw = String(rawQuery || "").trim();
  if (!raw) return [];
  const segments = raw
    .split(/[,;\n\r]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const t = seg.length > SEGMENT_MAX ? seg.slice(0, SEGMENT_MAX).trim() : seg;
    if (!SKU_TOKEN_PATTERN.test(t)) continue;
    const k = t.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function isLikelySkuToken(token: string): boolean {
  const t = token.trim();
  if (!SKU_TOKEN_PATTERN.test(t) || !t) return false;
  if (/\d/.test(t) || t.includes("-") || t.includes("_") || t.includes(".") || t.includes("/")) {
    return true;
  }
  if (/\s/.test(t) && t.split(/\s+/).length >= 2) return true;
  return false;
}

export function isExactSkuSearchQuery(rawQuery: string, tokens = parseSkuTokens(rawQuery)): boolean {
  const hasSkuListDelimiter = /[,&;\n\r\t]/.test(rawQuery);
  const allTokensLookLikeSkus = tokens.length > 0 && tokens.every((t) => isLikelySkuToken(t));
  const singleToken = tokens.length === 1 ? tokens[0].trim() : "";
  const singleStrongSkuToken =
    Boolean(singleToken) &&
    allTokensLookLikeSkus &&
    singleToken.replace(/\s+/g, "").length >= MIN_EXACT_SINGLE_SKU_LENGTH &&
    /[\d._/-]/.test(singleToken) &&
    !/[._/-]$/.test(singleToken);

  return (
    (tokens.length > 1 && (hasSkuListDelimiter || allTokensLookLikeSkus)) ||
    singleStrongSkuToken
  );
}

export function toTypesenseExactArray(values: string[]): string {
  const escaped = values.map((v) => `\`${String(v).replace(/`/g, "\\`")}\``);
  return `[${escaped.join(",")}]`;
}
