import type { ParsedUnit } from "@/lib/utils/bulkUnits";
import { parseBulkUnits } from "@/lib/utils/bulkUnits";

const META_BULK_SIMPLE = "wqu_unit_options";
const META_BULK_VARIATION = "wqu_var_unit_options";

export type WooMetaRow = { key?: string; value?: unknown };

/** Loose product shape from Woo REST (does not mutate). */
export type WooProductInput = {
  id?: number;
  type?: string;
  price?: string;
  meta_data?: WooMetaRow[];
  /** Product `variations` may be numeric IDs or full variation objects (e.g. after PDP fetch). */
  variations?: Array<number | WooVariationInput>;
};

export type WooVariationInput = {
  id?: number;
  price?: string;
  meta_data?: WooMetaRow[];
};

export type NormalizedProductVariation = {
  id: number;
  price: string;
  bulk_units: ParsedUnit[];
};

export type NormalizedProduct = {
  id: number;
  type: string;
  price: string;
  bulk_units: ParsedUnit[];
  variations: NormalizedProductVariation[];
};

function getMetaValue(meta: WooMetaRow[] | undefined, key: string): unknown {
  if (!meta?.length) return undefined;
  const row = meta.find((m) => m.key === key || m.key === `_${key}`);
  return row?.value;
}

/**
 * Coerce Woo meta `value` into `string[]` tokens for {@link parseBulkUnits}
 * (arrays, JSON strings, comma/pipe/newline lists, `{ value }` rows).
 */
export function coerceMetaToBulkTokenStrings(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const row of raw) {
      if (typeof row === "string") {
        const t = row.trim();
        if (t) out.push(t);
      } else if (row !== null && typeof row === "object") {
        const o = row as { value?: unknown; key?: unknown };
        const v = o.value ?? o.key;
        if (v != null) {
          const s = String(v).trim();
          if (s) out.push(s);
        }
      }
    }
    return out;
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== raw) {
        return coerceMetaToBulkTokenStrings(parsed);
      }
    } catch {
      /* treat as plain string */
    }
    return s
      .split(/[\n,|]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return [];
}

function safeVariationEntry(v: number | WooVariationInput): NormalizedProductVariation {
  if (typeof v === "number" && Number.isFinite(v)) {
    return { id: v, price: "", bulk_units: [] };
  }

  if (v !== null && typeof v === "object") {
    const idRaw = (v as WooVariationInput).id;
    const id = typeof idRaw === "number" && Number.isFinite(idRaw) ? idRaw : 0;
    const priceRaw = (v as WooVariationInput).price;
    const price = typeof priceRaw === "string" ? priceRaw : "";
    const meta = (v as WooVariationInput).meta_data;
    const varRaw = getMetaValue(meta, META_BULK_VARIATION);
    return {
      id,
      price,
      bulk_units: parseBulkUnits(coerceMetaToBulkTokenStrings(varRaw)),
    };
  }

  return { id: 0, price: "", bulk_units: [] };
}

/**
 * Read-only normalization: extracts bulk unit tokens from product / variation `meta_data`
 * and returns structured `bulk_units` via {@link parseBulkUnits}.
 */
export function normalizeProduct(product: WooProductInput): NormalizedProduct {
  const id =
    typeof product?.id === "number" && Number.isFinite(product.id) ? product.id : 0;
  const type = typeof product?.type === "string" ? product.type : "";
  const price = typeof product?.price === "string" ? product.price : "";

  const simpleRaw = getMetaValue(product?.meta_data, META_BULK_SIMPLE);
  const bulk_units = parseBulkUnits(coerceMetaToBulkTokenStrings(simpleRaw));

  const rawVariations = Array.isArray(product?.variations) ? product.variations : [];
  const variations = rawVariations.map((v) => safeVariationEntry(v));

  return {
    id,
    type,
    price,
    bulk_units,
    variations,
  };
}
