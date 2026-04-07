import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";

function metaDataString(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
  ...keys: string[]
): string {
  if (!meta?.length) return "";
  for (const key of keys) {
    const m = meta.find((x) => x?.key === key);
    const v = m?.value;
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * WooCommerce list responses often omit variable parent `regular_price` / `sale_price`.
 * Uses parent `meta_data` min-variation keys (no extra API calls).
 */
export function enrichWcListProductPricesForCard(product: WooCommerceProduct): WooCommerceProduct {
  const type = product.type;
  const regStr = product.regular_price != null ? String(product.regular_price).trim() : "";
  const saleStr = product.sale_price != null ? String(product.sale_price).trim() : "";
  const hasRegular = regStr !== "";
  const hasSale = saleStr !== "";

  if (type !== "variable" || (hasRegular && hasSale)) {
    return product;
  }

  const meta = product.meta_data as Array<{ key?: string; value?: unknown }> | undefined;
  const regular =
    regStr || metaDataString(meta, "_min_variation_regular_price", "min_variation_regular_price");
  const sale =
    saleStr || metaDataString(meta, "_min_variation_sale_price", "min_variation_sale_price");

  return {
    ...product,
    regular_price: regular || product.regular_price,
    sale_price: sale || product.sale_price,
  };
}

export interface ProductBrandInfo {
  id?: number;
  name: string;
  slug?: string;
  image?: string;
}

// Extended product type with optional brands field
interface ProductWithBrands extends WooCommerceProduct {
  brands?: Array<
    string | { id?: number; name?: string; slug?: string; image?: { src?: string } | string }
  >;
}

// Meta data item type
interface MetaDataItem {
  key: string;
  value: unknown;
}

// Product attribute type
interface ProductAttribute {
  name: string;
  options?: string[];
}

function variationAttrKey(name: string): string {
  let s = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/^attribute_/, "");
  if (s.startsWith("pa_")) s = s.slice(3);
  return s.replace(/[^a-z0-9]+/g, "");
}

function variationAttributeNamesMatch(a: string, b: string): boolean {
  const ka = variationAttrKey(a);
  const kb = variationAttrKey(b);
  if (ka.length > 0 && kb.length > 0) return ka === kb;
  return eq(a, b);
}

function isVariationAnyOption(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const v = raw.toLowerCase();
  if (v === "any" || v === "*") return true;
  if (v.startsWith("any ") || v.startsWith("any-") || v.startsWith("any|") || v.startsWith("any/"))
    return true;
  return /^any\b/i.test(raw);
}

function variationOptionMatchesSelected(variationOption: string, selectedValue: string): boolean {
  if (isVariationAnyOption(variationOption)) return true;
  return eq(variationOption, selectedValue);
}

/**
 * Match a variation based on selected attributes (label vs `pa_` names, "Any …" options, full concrete match).
 */
export function matchVariation(
  variations: WooCommerceVariation[],
  selected: { [name: string]: string }
): WooCommerceVariation | null {
  const names = Object.keys(selected);
  if (names.length === 0) return null;
  return (
    variations.find((v) => {
      const selectedOk = names.every((n) => {
        const va = v.attributes.find((a) => variationAttributeNamesMatch(a.name, n));
        return va && variationOptionMatchesSelected(va.option, selected[n]);
      });
      if (!selectedOk) return false;
      return v.attributes.every((attr) => {
        if (isVariationAnyOption(attr.option)) return true;
        const sk = names.find((k) => variationAttributeNamesMatch(k, attr.name));
        const sv = sk ? selected[sk] : undefined;
        return !!sv && variationOptionMatchesSelected(attr.option, sv);
      });
    }) || null
  );
}

/**
 * Find brand from product_brand taxonomy or attributes
 * WooCommerce REST API may include brands in the product response similar to categories
 */
export function findBrand(product: WooCommerceProduct): string | null {
  // First, check if product has brands taxonomy field (similar to categories structure)
  // The WooCommerce REST API may return brands when the product_brand taxonomy is registered
  const productWithBrands = product as ProductWithBrands;
  if (
    productWithBrands.brands &&
    Array.isArray(productWithBrands.brands) &&
    productWithBrands.brands.length > 0
  ) {
    // Brands might be objects with {id, name, slug} or just strings
    const firstBrand = productWithBrands.brands[0];
    if (typeof firstBrand === "string") {
      return firstBrand;
    } else if (firstBrand?.name) {
      return firstBrand.name;
    }
  }

  // Check meta_data for product_brand taxonomy data
  const metaData = product.meta_data as MetaDataItem[] | undefined;
  if (metaData && Array.isArray(metaData)) {
    const brandMeta = metaData.find((meta) => {
      const key = String(meta.key || "").toLowerCase();
      // Check for product_brand taxonomy or brand-related meta keys
      return (
        key === "product_brand" ||
        key === "_product_brand" ||
        (key.includes("brand") && !key.includes("image"))
      );
    });
    if (brandMeta?.value) {
      const value = brandMeta.value;
      // Value might be an ID, name, array, or object
      if (typeof value === "string") {
        return value;
      } else if (typeof value === "number") {
        // If it's an ID, we'd need to fetch the brand name, but for now return null
        return null;
      } else if (Array.isArray(value) && value.length > 0) {
        const first = value[0] as string | { name?: string };
        return typeof first === "string" ? first : first?.name || null;
      } else if (typeof value === "object" && value !== null && "name" in value) {
        return (value as { name: string }).name;
      }
    }
  }

  // Fallback: check attributes (for backward compatibility with attribute-based brands)
  const attributes = product.attributes as ProductAttribute[] | undefined;
  const attr = (attributes || []).find(
    (a) => eq(a.name, "brand") || eq(a.name, "product_brand") || eq(a.name, "Brand")
  );
  if (attr) {
    const opts = attr.options || [];
    if (opts.length > 0) return opts[0];
  }

  return null;
}

/**
 * Extract all brand entries from a product.
 */
export function extractProductBrands(product: WooCommerceProduct): ProductBrandInfo[] {
  const brands: ProductBrandInfo[] = [];
  const seen = new Set<string>();
  const addBrand = (brand: ProductBrandInfo | null | undefined) => {
    if (!brand || !brand.name) return;
    const key = `${brand.id ?? ""}:${brand.slug ?? ""}:${brand.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    brands.push(brand);
  };

  const productWithBrands = product as ProductWithBrands;
  if (Array.isArray(productWithBrands.brands)) {
    productWithBrands.brands.forEach((brand) => {
      if (!brand) return;
      if (typeof brand === "string") {
        addBrand({ name: brand });
        return;
      }
      addBrand({
        id: typeof brand.id === "number" ? brand.id : undefined,
        name: brand.name || brand.slug || "",
        slug: brand.slug,
        image: typeof brand.image === "object" ? brand.image?.src : brand.image,
      });
    });
  }

  const metaData = product.meta_data as MetaDataItem[] | undefined;
  if (Array.isArray(metaData)) {
    metaData.forEach((meta) => {
      const key = String(meta?.key || "").toLowerCase();
      if (!key.includes("brand") || key.includes("image")) return;
      const value = meta.value;
      if (!value) return;
      if (typeof value === "string") {
        addBrand({ name: value });
      } else if (Array.isArray(value)) {
        value.forEach((item: unknown) => {
          if (typeof item === "string") {
            addBrand({ name: item });
          } else if (typeof item === "object" && item !== null && "name" in item) {
            const brandItem = item as { id?: number; name: string; slug?: string };
            addBrand({
              id: typeof brandItem.id === "number" ? brandItem.id : undefined,
              name: brandItem.name,
              slug: brandItem.slug,
            });
          }
        });
      } else if (typeof value === "object" && value !== null && "name" in value) {
        const brandValue = value as { id?: number; name: string; slug?: string };
        addBrand({
          id: typeof brandValue.id === "number" ? brandValue.id : undefined,
          name: brandValue.name,
          slug: brandValue.slug,
        });
      }
    });
  }

  // Fallback to attribute-based brands
  const attributes = product.attributes as ProductAttribute[] | undefined;
  (attributes || []).forEach((attr) => {
    if (eq(attr.name, "brand") || eq(attr.name, "product_brand") || eq(attr.name, "Brand")) {
      const opts = attr.options || [];
      opts.forEach((opt) => addBrand({ name: opt }));
    }
  });

  // If we still have no brands, use the first brand name
  if (brands.length === 0) {
    const single = findBrand(product);
    if (single) {
      addBrand({ name: single });
    }
  }

  return brands;
}

/**
 * Case-insensitive string equality
 */
export function eq(a?: string, b?: string): boolean {
  return (a || "").toLowerCase() === (b || "").toLowerCase();
}

/**
 * Check if all required attributes are selected
 */
export function isAllSelected(
  selected: { [name: string]: string },
  attrs: { name: string; options: string[] }[]
): boolean {
  if (!attrs || attrs.length === 0) return true;
  return attrs.every((a) => !!selected[a.name]);
}

/**
 * Calculate sale percentage from WooCommerce prices
 * This is the ONLY reliable source of discount
 */
export function getSalePercentageFromProduct(product: {
  on_sale?: boolean;
  regular_price?: string;
  sale_price?: string;
}): number | null {
  if (!product?.on_sale) return null;

  const regular = parseFloat(product.regular_price || "0");
  const sale = parseFloat(product.sale_price || "0");

  if (!regular || !sale || sale >= regular) return null;

  return Math.round(((regular - sale) / regular) * 100);
}

/**
 * Remove duplicate products by numeric `id`, preserving first occurrence order.
 */
export function dedupeProductsById<T extends { id?: unknown }>(items: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of items) {
    const id = Number(item?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * Normalize products from API/caller: accept array or { products: array } and return a plain array.
 * Used by ProductSectionCard, ProductsSlider, etc.
 */
export function normalizeProductsList<T extends { id?: unknown }>(
  raw: T[] | { products?: T[] } | null | undefined,
): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return dedupeProductsById(raw);
  if (
    typeof raw === "object" &&
    "products" in raw &&
    Array.isArray((raw as { products?: T[] }).products)
  )
    return dedupeProductsById((raw as { products: T[] }).products);
  return [];
}
