import { getTaxDisplayType } from "@/lib/format-utils";

/** Default `query_by` when `TYPESENSE_QUERY_BY` is unset; keep in sync with `HeaderSearch`. */
export const TYPESENSE_DEFAULT_QUERY_BY =
  "name,sku,category,brand,tags";

export const TS_FIELDS = {
  categorySlug: process.env.TYPESENSE_FIELD_CATEGORY_SLUG || "category",
  brandSlug: process.env.TYPESENSE_FIELD_BRAND_SLUG || "brand",
  tagSlug: process.env.TYPESENSE_FIELD_TAG_SLUG || "tags",
  price: process.env.TYPESENSE_FIELD_PRICE || "price",
  /** Empty = do not apply on_sale filter (collection has no such field). */
  onSale: (process.env.TYPESENSE_FIELD_ON_SALE ?? "").trim(),
  /** Numeric sale price field; used with clearance to include discounted rows even if `on_sale` is false. */
  salePrice: (process.env.TYPESENSE_FIELD_SALE_PRICE ?? "sale_price").trim(),
  /** Defaults to `popularity`; override via env when schema uses a different field name. */
  popularity: (process.env.TYPESENSE_FIELD_POPULARITY ?? "popularity").trim(),
  /** Defaults to `date_created`; override via env when schema uses a different field name. */
  dateCreated: (process.env.TYPESENSE_FIELD_DATE_CREATED ?? "date_created").trim(),
  rating: (process.env.TYPESENSE_FIELD_RATING ?? "").trim(),
} as const;

/** Facet fields for search; keep in sync with TS_FIELDS unless TYPESENSE_FACET_BY is set. */
export function getTypesenseFacetBy(): string {
  const raw = process.env.TYPESENSE_FACET_BY?.trim();
  if (raw) return raw;
  return `${TS_FIELDS.brandSlug},${TS_FIELDS.categorySlug}`;
}

/** Escape a filter value for Typesense (wrap in backticks if needed). */
export function tsEscapeFilterValue(value: string): string {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^[a-zA-Z0-9_-]+$/.test(v)) return v;
  return `\`${v.replace(/`/g, "\\`")}\``;
}

export function buildTypesenseFilterParts(opts: {
  categorySlug?: string | null;
  tagSlug?: string | null;
  brandSlugs?: string[];
  brandSlugSingle?: string | null;
  minPrice?: string | null;
  maxPrice?: string | null;
  onSaleOnly?: boolean;
}): string[] {
  const f: string[] = [];
  const cat = opts.categorySlug?.trim();
  const catField = TS_FIELDS.categorySlug;

  if (cat) {
    f.push(`${catField}:=${tsEscapeFilterValue(cat)}`);
  }

  const tag = opts.tagSlug?.trim();
  if (tag) {
    f.push(`${TS_FIELDS.tagSlug}:=${tsEscapeFilterValue(tag)}`);
  }

  if (opts.brandSlugSingle?.trim()) {
    f.push(`${TS_FIELDS.brandSlug}:=${tsEscapeFilterValue(opts.brandSlugSingle.trim())}`);
  } else if (opts.brandSlugs && opts.brandSlugs.length > 0) {
    const parts = opts.brandSlugs
      .map((s) => s.trim())
      .filter(Boolean)
      .map(tsEscapeFilterValue)
      .filter(Boolean);
    if (parts.length === 1) {
      f.push(`${TS_FIELDS.brandSlug}:=${parts[0]}`);
    } else if (parts.length > 1) {
      f.push(`${TS_FIELDS.brandSlug}:[${parts.join(",")}]`);
    }
  }

  const pf = TS_FIELDS.price;
  const minP = opts.minPrice?.trim();
  const maxP = opts.maxPrice?.trim();
  if (minP && /^\d+(\.\d+)?$/.test(minP)) {
    f.push(`${pf}:>=${minP}`);
  }
  if (maxP && /^\d+(\.\d+)?$/.test(maxP)) {
    f.push(`${pf}:<=${maxP}`);
  }

  if (opts.onSaleOnly) {
    const os = TS_FIELDS.onSale;
    const sp = TS_FIELDS.salePrice;
    if (os && sp) {
      f.push(`(${os}:=true || ${sp}:>0)`);
    } else if (os) {
      f.push(`${os}:=true`);
    } else if (sp) {
      f.push(`${sp}:>0`);
    }
  }

  return f;
}

export function mapSortToTypesense(sortBy: string | null | undefined): string {
  const pf = TS_FIELDS.price;
  const pop = TS_FIELDS.popularity;
  const dt = TS_FIELDS.dateCreated;
  const rt = TS_FIELDS.rating;
  const byPriceDesc = `${pf}:desc`;
  const byPopularityThenNewest = pop && dt ? `${pop}:desc,${dt}:desc` : pop ? `${pop}:desc` : dt ? `${dt}:desc` : byPriceDesc;
  switch (sortBy) {
    case "relevance":
      // Typesense keyword relevance first; tie-break so UX stays stable among equal matches.
      if (pop) return `_text_match:desc,${pop}:desc,${pf}:desc`;
      return `_text_match:desc,${pf}:desc`;
    case "price_low":
      return `${pf}:asc`;
    case "price_high":
      return `${pf}:desc`;
    case "newest":
      return dt ? `${dt}:desc` : byPriceDesc;
    case "rating":
      return rt ? `${rt}:desc` : byPriceDesc;
    case "popularity":
      return byPopularityThenNewest;
    default:
      return byPopularityThenNewest;
  }
}

/** De-duplicate listing products by numeric id (keeps first occurrence order). */
export function dedupeProductsById<T extends { id?: unknown }>(items: T[]): T[] {
  const byId = new Map<number, T>();
  const order: number[] = [];

  const norm = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-");

  const score = (item: T): number => {
    const anyItem = item as Record<string, unknown>;
    const taxClass = norm(anyItem.tax_class ?? anyItem.taxClass);
    const taxStatus = norm(anyItem.tax_status ?? anyItem.taxStatus);

    let s = 0;
    if (taxClass) s += 2;
    if (taxStatus) s += 2;
    if (taxClass === "gst-free" || taxClass === "gstfree" || taxClass.includes("free")) s += 4;
    if (taxStatus === "none" || taxStatus === "exempt" || taxStatus === "non-taxable") s += 3;
    return s;
  };

  for (const item of items) {
    const id = Number(item?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      order.push(id);
      continue;
    }

    // For duplicates (common with variation/index rows), keep the richer tax payload.
    if (score(item) > score(existing)) {
      byId.set(id, item);
    }
  }
  return order
    .map((id) => byId.get(id))
    .filter((item): item is T => Boolean(item));
}

function firstStringish(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return firstStringish(v[0]);
  return String(v);
}

function stringArrayish(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const s = String(v ?? "").trim();
  return s ? [s] : [];
}

function labelFromSlug(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    const s = firstStringish(v).trim();
    if (s) return s;
  }
  return undefined;
}

function toBooleanLike(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s) return null;
    if (["1", "true", "yes", "y"].includes(s)) return true;
    if (["0", "false", "no", "n"].includes(s)) return false;
  }
  return null;
}

function normalizeTaxStatus(v: unknown): string | undefined {
  if (typeof v === "boolean") return v ? "taxable" : "none";
  if (typeof v === "number") return v === 0 ? "none" : "taxable";
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!s) return undefined;
  if (["none", "non-taxable", "nontaxable", "exempt", "free", "false", "0"].includes(s)) {
    return "none";
  }
  if (["taxable", "shipping", "standard", "true", "1"].includes(s)) {
    return "taxable";
  }
  return s;
}

/** Typesense row is a Woo variation when `type` is variation or `id` differs from `parent_id`. */
function typesenseDocIsVariation(doc: Record<string, unknown>): boolean {
  const t = String(doc.type ?? "").toLowerCase();
  if (t === "variation") return true;
  const idRaw = doc.id ?? doc.product_id;
  const parentRaw = doc.parent_id ?? doc.parentId;
  if (parentRaw == null || String(parentRaw).trim() === "") return false;
  if (idRaw == null) return false;
  return String(parentRaw).trim() !== String(idRaw).trim();
}

export function typesenseHitToListingProduct(doc: Record<string, unknown>) {
  const id = Number(doc.id ?? doc.product_id ?? 0);
  const isVariationDoc = typesenseDocIsVariation(doc);
  const price = String(doc.price ?? doc.current_price ?? "0");
  const regular = String(doc.regular_price ?? doc.regular ?? "");
  const sale = String(doc.sale_price ?? doc.sale ?? "");
  const onSale = Boolean(doc.on_sale ?? doc.onSale);
  const name = String(doc.name ?? "");
  const slug = String(doc.slug ?? "");
  const sku = firstStringish(doc.sku);
  const img = (doc.image as string) || (doc.image_url as string) || (doc.thumbnail as string) || "";
  const imgAlt = String(doc.image_alt ?? doc.name ?? name);

  let sale_percentage: number | null = null;
  const regNum = Number(regular);
  const saleNum = Number(sale);
  // Require a real markdown: Woo/Typesense often leave sale_price as "0.00" (truthy string) when not on sale —
  // without saleNum > 0 that would incorrectly compute 100% off.
  if (onSale && regular && sale && regNum > 0 && saleNum > 0 && saleNum < regNum) {
    sale_percentage = Math.round(((regNum - saleNum) / regNum) * 100);
  }

  const brandName = firstStringish(doc.brand_name ?? doc.brand ?? doc.brand_title);
  const tags = stringArrayish(doc.tags).map((tag, index) => ({
    id: index + 1,
    name: labelFromSlug(tag),
    slug: tag,
  }));
  const taxClass = firstNonEmptyString(
    doc.tax_class,
    doc.taxClass,
    doc.variation_tax_class,
    doc.variationTaxClass,
    doc.parent_tax_class,
    doc.parentTaxClass,
    doc.product_tax_class,
    doc.productTaxClass,
    doc.tax_class_slug,
    doc.taxClassSlug,
  );
  const taxStatusFromDoc = firstNonEmptyString(
    doc.tax_status,
    doc.taxStatus,
    doc.variation_tax_status,
    doc.variationTaxStatus,
    doc.parent_tax_status,
    doc.parentTaxStatus,
  );
  const explicitGstFree =
    toBooleanLike(doc.gst_free) === true ||
    toBooleanLike(doc.is_gst_free) === true ||
    toBooleanLike(doc.gstFree) === true;

  const normalizedTaxStatus = normalizeTaxStatus(taxStatusFromDoc);
  /** Align listing with PDP / {@link formatPriceWithLabel}: GST-free from class or status, not only `gst_free` column. */
  const inferredGstFreeFromTaxFields =
    getTaxDisplayType(taxClass, normalizedTaxStatus ?? taxStatusFromDoc ?? "") === "gst_free";

  const gstFreeProduct = explicitGstFree || inferredGstFreeFromTaxFields;
  const taxStatus = gstFreeProduct ? "none" : normalizedTaxStatus ?? undefined;

  return {
    id,
    name,
    slug,
    sku,
    price,
    sale_price: sale,
    regular_price: regular,
    on_sale: onSale,
    sale_percentage,
    image: img,
    images: img ? [{ src: img, alt: imgAlt }] : [],
    average_rating: String(doc.average_rating ?? doc.rating ?? "0"),
    rating_count: Number(doc.rating_count ?? 0),
    tax_class: taxClass,
    tax_status: taxStatus,
    /** True when index marks GST-free or tax_class/status resolve to GST-free (matches PDP). */
    gstFree: gstFreeProduct,
    brand_name: brandName,
    tags,
    /** When Typesense row is a Woo variation, `id` is the variation id — use for `?variation_id=` PDP links. */
    variation_id: isVariationDoc && id > 0 ? id : undefined,
  };
}

/** Search / listing row with parent vs variation metadata (Typesense `type`, `parent_id`, `attributes`). */
export function typesenseHitToSearchProduct(doc: Record<string, unknown>) {
  const base = typesenseHitToListingProduct(doc);
  const docType: "parent" | "variation" = typesenseDocIsVariation(doc) ? "variation" : "parent";
  const parentRaw = doc.parent_id ?? doc.parentId;
  const parentId =
    parentRaw != null && String(parentRaw).trim() !== ""
      ? String(parentRaw).trim()
      : String(base.id);

  const attributes: Record<string, string> = {};
  const rawAttr = doc.attributes;
  if (rawAttr && typeof rawAttr === "object" && !Array.isArray(rawAttr)) {
    for (const [k, v] of Object.entries(rawAttr as Record<string, unknown>)) {
      if (!k) continue;
      attributes[k] = String(v ?? "").trim();
    }
  }

  const inStock =
    typeof doc.in_stock === "boolean"
      ? doc.in_stock
      : typeof doc.inStock === "boolean"
        ? doc.inStock
        : true;

  return {
    ...base,
    docType,
    parentId,
    attributes,
    inStock,
  };
}

export type TypesenseSearchProduct = ReturnType<typeof typesenseHitToSearchProduct>;