/**
 * Multi-SKU paste / comma-separated lookup for Typesense search.
 * - Split on commas / semicolons / newlines — **not** spaces — so SKUs like `NC VAN LF` stay one token.
 * - Allow spaces inside a SKU segment (warehouse / legacy formats).
 */

/** URL / client / API: long comma-separated SKU lists exceed 200–500 chars. */
export const MAX_SKU_SEARCH_QUERY_LEN = 8000;

const SEGMENT_MAX = 180;
const SKU_TOKEN_PATTERN = /^[A-Za-z0-9._/\s-]+$/;
const SKU_STRUCTURAL_SEPARATOR_PATTERN = /[._/-]/;

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
  if (/\d/.test(t) || SKU_STRUCTURAL_SEPARATOR_PATTERN.test(t)) {
    return true;
  }
  if (/\s/.test(t) && t.split(/\s+/).length >= 2) return true;
  return false;
}

function isUnstructuredMultiWordToken(token: string): boolean {
  return /\s/.test(token) && !SKU_STRUCTURAL_SEPARATOR_PATTERN.test(token);
}

export function isSingleSkuAutocompleteQuery(
  rawQuery: string,
  tokens = parseSkuTokens(rawQuery)
): boolean {
  if (tokens.length !== 1) return false;
  const token = tokens[0].trim();
  if (!isLikelySkuToken(token)) return false;
  if (!/[\d._/-]/.test(token)) return false;
  // Product names like "3in 1 wet" look SKU-ish because they contain digits and spaces.
  // Without a structural SKU separator, keep them in keyword search instead of SKU mode.
  if (isUnstructuredMultiWordToken(token)) return false;
  return true;
}

export function isExactSkuSearchQuery(rawQuery: string, tokens = parseSkuTokens(rawQuery)): boolean {
  const hasSkuListDelimiter = /[,&;\n\r\t]/.test(rawQuery);
  const allTokensLookLikeSkus = tokens.length > 0 && tokens.every((t) => isLikelySkuToken(t));

  return tokens.length > 1 && (hasSkuListDelimiter || allTokensLookLikeSkus);
}

export function toTypesenseExactArray(values: string[]): string {
  const escaped = values.map((v) => `\`${String(v).replace(/`/g, "\\`")}\``);
  return `[${escaped.join(",")}]`;
}
