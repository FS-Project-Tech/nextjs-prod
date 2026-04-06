/**
 * Typesense filter/sort helpers for the `products` collection.
 *
 * Env overrides (examples):
 * - TYPESENSE_FIELD_CATEGORY_SLUG — filter/facet field for category (default `category`)
 * - TYPESENSE_FIELD_BRAND_SLUG — brand filter/facet (default `brand`)
 * - TYPESENSE_FACET_BY — comma-separated facet fields (default: brand + category fields above)
 * - TYPESENSE_FIELD_ON_SALE — if unset/empty, `on_sale=true` branch is skipped (no field in schema)
 * - TYPESENSE_FIELD_SALE_PRICE — optional; default `sale_price`. Clearance uses `(on_sale:true || sale_price>0)` when both exist.
 * - TYPESENSE_FIELD_POPULARITY / DATE_CREATED / RATING — if unset, sort falls back to `price:desc`
 */

export const TS_FIELDS = {
  categorySlug: process.env.TYPESENSE_FIELD_CATEGORY_SLUG || "category",
  brandSlug: process.env.TYPESENSE_FIELD_BRAND_SLUG || "brand",
  price: process.env.TYPESENSE_FIELD_PRICE || "price",
  /** Empty = do not apply on_sale filter (collection has no such field). */
  onSale: (process.env.TYPESENSE_FIELD_ON_SALE ?? "").trim(),
  /** Numeric sale price field; used with clearance to include discounted rows even if `on_sale` is false. */
  salePrice: (process.env.TYPESENSE_FIELD_SALE_PRICE ?? "sale_price").trim(),
  /** Empty = popularity sort uses price fallback. */
  popularity: (process.env.TYPESENSE_FIELD_POPULARITY ?? "").trim(),
  dateCreated: (process.env.TYPESENSE_FIELD_DATE_CREATED ?? "").trim(),
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
  switch (sortBy) {
    case "price_low":
      return `${pf}:asc`;
    case "price_high":
      return `${pf}:desc`;
    case "newest":
      return dt ? `${dt}:desc` : byPriceDesc;
    case "rating":
      return rt ? `${rt}:desc` : byPriceDesc;
    case "popularity":
    default:
      return pop ? `${pop}:desc` : byPriceDesc;
  }
}

/** De-duplicate listing products by numeric id (keeps first occurrence order). */
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

function firstStringish(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return firstStringish(v[0]);
  return String(v);
}

export function typesenseHitToListingProduct(doc: Record<string, unknown>) {
  const id = Number(doc.id ?? doc.product_id ?? 0);
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
  if (regular && sale && Number(regular) > 0) {
    sale_percentage = Math.round(((Number(regular) - Number(sale)) / Number(regular)) * 100);
  }

  const brandName = firstStringish(doc.brand_name ?? doc.brand ?? doc.brand_title);

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
    tax_class: doc.tax_class as string | undefined,
    tax_status: doc.tax_status as string | undefined,
    brand_name: brandName,
  };
}
