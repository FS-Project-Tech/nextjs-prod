//D:\stage-joya\nextjs-stage\lib\woocommerce\quantity-units-meta.ts

import type { WooCommerceProduct, WooCommerceVariation } from "./types";

function normalizeMetaKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "");
}

function parsePhpSerializedStringArray(input: string): string[] {
  const out: string[] = [];
  const re = /s:\d+:"([^"]*)"/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(input)) !== null) {
    const v = String(m[1] || "").trim();
    if (v) out.push(v);
  }
  return Array.from(new Set(out));
}

function parseUnitOptionsValue(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const values = raw
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item).trim();
        if (item && typeof item === "object") {
          const maybe = item as { value?: unknown; label?: unknown; name?: unknown };
          return String(maybe.value ?? maybe.label ?? maybe.name ?? "").trim();
        }
        return "";
      })
      .filter((v) => v.length > 0);
    return Array.from(new Set(values));
  }

  if (typeof raw === "string") {
    const str = raw.trim();
    if (!str) return [];

    if (str.startsWith("[") && str.endsWith("]")) {
      try {
        const parsed = JSON.parse(str) as unknown;
        return parseUnitOptionsValue(parsed);
      } catch {
        // continue with fallback parsing below
      }
    }

    if (/^a:\d+:\{/.test(str)) {
      const parsedSerialized = parsePhpSerializedStringArray(str);
      if (parsedSerialized.length > 0) return parsedSerialized;
    }

    const split = str
      .split(/[\n,|]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
    return Array.from(new Set(split));
  }

  if (typeof raw === "number") {
    return [String(raw)];
  }

  if (typeof raw === "object") {
    const obj = raw as { options?: unknown; value?: unknown };
    const fromOptions = parseUnitOptionsValue(obj.options);
    if (fromOptions.length > 0) return fromOptions;
    return parseUnitOptionsValue(obj.value);
  }

  return [];
}

type MetaRow = { id?: number; key?: string; value?: unknown };

const UNIT_OPTION_META_KEYS = new Set([
  "availableunitoptions",
  "_availableunitoptions",
  "availableunitoption",
  "_availableunitoption",
  "availableunit",
  "_availableunit",
  "quantityunits",
  "_quantityunits",
  "quantityunit",
  "_quantityunit",
  "quantityunitoptions",
  "_quantityunitoptions",
]);

function extractUnitOptionsFromMeta(meta: MetaRow[] | undefined): string[] {
  if (!meta?.length) return [];
  const merged: string[] = [];
  for (const m of meta) {
    const key = normalizeMetaKey(String(m?.key || ""));
    if (!key) continue;
    if (
      UNIT_OPTION_META_KEYS.has(key) ||
      (key.includes("unit") && key.includes("option")) ||
      (key.includes("pack") && key.includes("option"))
    ) {
      merged.push(...parseUnitOptionsValue(m?.value));
    }
  }
  return Array.from(new Set(merged)).filter(Boolean);
}

/**
 * Reads "Available Unit Options" (and similar) from a variation's Woo meta_data.
 * Safe for client components.
 */
export function extractVariationUnitOptions(variation: WooCommerceVariation | null): string[] {
  return extractUnitOptionsFromMeta(variation?.meta_data);
}

/**
 * Same as {@link extractVariationUnitOptions} but for simple (or parent) product meta_data.
 * Quantity Units plugin stores selections on the product when not using variations.
 */
export function extractProductUnitOptions(product: WooCommerceProduct | null): string[] {
  return extractUnitOptionsFromMeta(product?.meta_data as MetaRow[] | undefined);
}
