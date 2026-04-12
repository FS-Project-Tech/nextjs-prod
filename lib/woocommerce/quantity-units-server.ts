//D:\stage-joya\nextjs-stage\lib\woocommerce\quantity-units-server.ts

import "server-only";

import { unstable_cache } from "next/cache";
import type { WooCommerceProduct, WooCommerceVariation } from "./types";
import { extractProductUnitOptions, extractVariationUnitOptions } from "./quantity-units-meta";

type QuantityUnitApiOption = { option_label?: string };
type QuantityUnitsApiResponse = { has_options?: boolean; units?: QuantityUnitApiOption[] };

function getWpBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WP_URL ||
    process.env.WORDPRESS_URL ||
    "https://stage.joyamedicalsupplies.com.au"
  ).replace(/\/$/, "");
}

async function fetchQuantityUnitsFromApi(sku: string): Promise<string[]> {
  const trimmed = String(sku).trim();
  if (!trimmed) return [];

  const url = `${getWpBaseUrl()}/wp-json/wc-quantity-units/v1/units?sku=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as QuantityUnitsApiResponse;
  if (!Array.isArray(data?.units)) return [];
  return Array.from(
    new Set(
      data.units
        .map((u) => String(u?.option_label || "").trim())
        .filter((v) => v.length > 0),
    ),
  );
}

/**
 * Cached per SKU so repeat product views and ISR revalidations avoid hammering WordPress.
 */
export function getCachedQuantityUnitsForSku(sku: string): Promise<string[]> {
  const trimmed = String(sku).trim();
  const key = trimmed.toLowerCase();
  if (!key) return Promise.resolve([]);

  return unstable_cache(
    async () => fetchQuantityUnitsFromApi(trimmed),
    ["wc-quantity-units", key],
    { revalidate: 600 },
  )();
}

function mergeUniqueLabels(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...a, ...b]) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}

/**
 * When Woo meta already lists real unit choices, that list is authoritative — skip the
 * plugin to avoid extra/wrong labels. Still fetch when meta is empty or only "Each"
 * (plugin often supplies ctn/box rows in that case).
 */
function shouldFetchPluginQuantityUnits(metaLabels: string[]): boolean {
  const labels = (metaLabels ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (labels.length === 0) return true;
  if (labels.length === 1 && labels[0].toLowerCase() === "each") return true;
  return false;
}

/**
 * Builds a lowercase-SKU → unit option labels map for the PDP so the client does not
 * wait on wc-quantity-units when the shopper changes variation.
 *
 * Reads variation meta first. Calls wc-quantity-units REST only when meta has no options
 * or only "Each", then merges (meta order first, case-insensitive dedupe).
 */
export async function buildInitialSkuQuantityUnitsMap(
  variations: WooCommerceVariation[],
  parentSku: string,
): Promise<Record<string, string[]>> {
  const skuOriginal = new Map<string, string>();
  for (const v of variations) {
    const s = String(v.sku ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (!skuOriginal.has(k)) skuOriginal.set(k, s);
  }
  const ps = String(parentSku ?? "").trim();
  if (ps && !skuOriginal.has(ps.toLowerCase())) {
    skuOriginal.set(ps.toLowerCase(), ps);
  }

  const map: Record<string, string[]> = {};
  for (const [k] of skuOriginal) {
    const v =
      variations.find((x) => String(x.sku ?? "").trim().toLowerCase() === k) ?? null;
    map[k] = v ? extractVariationUnitOptions(v) : [];
  }

  await Promise.all(
    [...skuOriginal.keys()].map(async (k) => {
      const original = skuOriginal.get(k);
      if (!original) return;
      const meta = map[k] ?? [];
      if (!shouldFetchPluginQuantityUnits(meta)) return;
      const api = await getCachedQuantityUnitsForSku(original);
      map[k] = mergeUniqueLabels(meta, api);
    }),
  );

  return map;
}

/**
 * Simple / non-variable products: Quantity Units meta lives on the product, not variations.
 */
export async function buildInitialSkuQuantityUnitsForSimpleProduct(
  product: WooCommerceProduct,
): Promise<Record<string, string[]>> {
  const sku = String(product.sku ?? "").trim();
  const k = sku.toLowerCase();
  if (!k) return {};

  const meta = extractProductUnitOptions(product);
  if (!shouldFetchPluginQuantityUnits(meta)) {
    return { [k]: meta };
  }
  const api = await getCachedQuantityUnitsForSku(sku);
  return { [k]: mergeUniqueLabels(meta, api) };
}
