export type ProductSearchQueryPlan = {
  strictQuery: string;
  relaxedQuery: string;
  relaxedParts: string[];
  tokens: string[];
};

const MAX_RELAXED_PARTS = 24;
const MAX_QUERY_LENGTH = 8000;
const STOP_WORDS = new Set(["a", "an", "and", "by", "for", "of", "or", "the", "to", "with"]);

function uniqPush(out: string[], value: string) {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return;
  const key = v.toLowerCase();
  if (out.some((existing) => existing.toLowerCase() === key)) return;
  out.push(v);
}

export function normalizeProductSearchQuery(rawQuery: string): string {
  return String(rawQuery || "")
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[<>'"`;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function tokenizeProductSearchQuery(rawQuery: string): string[] {
  const normalized = normalizeProductSearchQuery(rawQuery).toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token && (token.length >= 2 || /^\d+$/.test(token)))
    .filter((token) => !STOP_WORDS.has(token));

  const out: string[] = [];
  for (const token of tokens) uniqPush(out, token);
  return out;
}

function phraseVariants(query: string): string[] {
  const out: string[] = [];

  const threeInOnePattern = /\b(\d+)\s*-?\s*in\s*-?\s*(\d+)\b/gi;
  for (const match of query.matchAll(threeInOnePattern)) {
    const full = match[0];
    const left = match[1];
    const right = match[2];
    const variants = [
      `${left}in ${right}`,
      `${left} in ${right}`,
      `${left}-in-${right}`,
      `${left}in${right}`,
    ];
    for (const variant of variants) {
      uniqPush(out, query.replace(full, variant));
      uniqPush(out, variant);
    }
  }

  const unitPattern =
    /\b(\d+(?:\.\d+)?)\s*(ml|millilitre|milliliter|millilitres|milliliters|l|lt|ltr|litre|liter|litres|liters)\b/gi;
  for (const match of query.matchAll(unitPattern)) {
    const full = match[0];
    const amount = match[1];
    const unit = match[2].toLowerCase();
    const isMl = unit.startsWith("ml") || unit.startsWith("milli");
    const variants = isMl
      ? [`${amount}ml`, `${amount} ml`, `${amount} millilitre`, `${amount} milliliter`]
      : [`${amount}l`, `${amount} l`, `${amount} litre`, `${amount} liter`];
    for (const variant of variants) {
      uniqPush(out, query.replace(full, variant));
      uniqPush(out, variant);
    }
  }

  return out;
}

function tokenVariants(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    uniqPush(out, token);
    if (/^[a-z]{4,}s$/i.test(token)) {
      uniqPush(out, token.slice(0, -1));
    } else if (/^[a-z]{4,}$/i.test(token)) {
      uniqPush(out, `${token}s`);
    }
  }
  return out;
}

export function buildProductSearchQueryPlan(rawQuery: string): ProductSearchQueryPlan {
  const strictQuery = normalizeProductSearchQuery(rawQuery);
  if (!strictQuery || strictQuery === "*") {
    return {
      strictQuery: strictQuery || "*",
      relaxedQuery: strictQuery || "*",
      relaxedParts: [],
      tokens: [],
    };
  }

  const tokens = tokenizeProductSearchQuery(strictQuery);
  const relaxedParts: string[] = [];
  uniqPush(relaxedParts, strictQuery);
  for (const variant of phraseVariants(strictQuery)) uniqPush(relaxedParts, variant);
  for (const variant of tokenVariants(tokens)) uniqPush(relaxedParts, variant);

  const cappedParts = relaxedParts.slice(0, MAX_RELAXED_PARTS);
  return {
    strictQuery,
    relaxedQuery: cappedParts.join(" || ") || strictQuery,
    relaxedParts: cappedParts,
    tokens,
  };
}
