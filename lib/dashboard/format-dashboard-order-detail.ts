import { extractMachshipTrackingTokenFromOrderMeta } from "@/lib/machship/tracking";

/** Same cutoff as dashboard orders list (legacy vs Woo). */
export const ORDER_DETAIL_CUTOFF_MS = new Date("2026-04-07").getTime();

export function orderDateMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function orderRefMatchesRow(row: Record<string, unknown>, ref: string): boolean {
  const r = ref.trim();
  const num = String(row.number ?? row.order_number ?? "").trim();
  return num === r;
}

function emptyBilling(): Record<string, string> {
  return {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    postcode: "",
    country: "",
  };
}

function emptyShipping(): Record<string, string> {
  return {
    first_name: "",
    last_name: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    postcode: "",
    country: "",
  };
}

function normalizeBilling(b: unknown): Record<string, string> {
  const d = emptyBilling();
  if (b && typeof b === "object") Object.assign(d, b as Record<string, string>);
  return d;
}

function normalizeShipping(s: unknown): Record<string, string> {
  const d = emptyShipping();
  if (s && typeof s === "object") Object.assign(d, s as Record<string, string>);
  return d;
}

function metaValueToSkuString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Normalize meta key for matching (handles `_sku`, `SKU`, display_key). */
function normalizeSkuMetaKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Product / variation SKU from a WooCommerce order line item (or compatible legacy row).
 * Woo often leaves `line_item.sku` empty and stores it in meta_data or only on the product.
 */
export function extractLineItemSku(item: Record<string, unknown>): string | undefined {
  for (const k of ["sku", "product_sku"] as const) {
    const v = item[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }

  const variation = item.variation;
  if (variation && typeof variation === "object" && variation !== null) {
    const vs = (variation as { sku?: unknown }).sku;
    if (vs != null && String(vs).trim()) return String(vs).trim();
  }

  const meta = item.meta_data;
  if (Array.isArray(meta)) {
    for (const entry of meta) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const keyRaw = e.key ?? e.display_key ?? "";
      const nk = normalizeSkuMetaKey(keyRaw);
      if (nk === "sku" || nk === "product sku") {
        const s = metaValueToSkuString(e.value);
        if (s) return s;
      }
    }
  }

  return undefined;
}

/** Extra keys / shapes common in joya-legacy-orders and older ERP exports (before Woo line-item shape). */
const LEGACY_SKU_DIRECT_KEYS = [
  "sku",
  "product_sku",
  "item_sku",
  "itemSku",
  "productSku",
  "stock_keeping_unit",
  "stock_code",
  "stockCode",
  "product_code",
  "productCode",
  "item_code",
  "itemCode",
  "code",
  "part_number",
  "partNumber",
  "catalog_sku",
  "catalogSku",
  "barcode",
] as const;

function readSkuFromObject(obj: Record<string, unknown>): string | undefined {
  for (const k of LEGACY_SKU_DIRECT_KEYS) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

/**
 * SKU from a legacy API line row: flat fields, nested `product`, then Woo-compatible meta/variation.
 */
export function extractLegacyLineItemSku(item: Record<string, unknown>): string | undefined {
  const direct = readSkuFromObject(item);
  if (direct) return direct;

  const product = item.product;
  if (product && typeof product === "object" && product !== null) {
    const nested = readSkuFromObject(product as Record<string, unknown>);
    if (nested) return nested;
  }

  const meta = item.meta_data;
  if (Array.isArray(meta)) {
    const looseSkuKeys = new Set([
      "barcode",
      "partnumber",
      "itemcode",
      "productcode",
      "catalogsku",
      "stockcode",
    ]);
    for (const entry of meta) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const nk = normalizeSkuMetaKey(e.key ?? e.display_key ?? e.name ?? "");
      if (nk.includes("sku") || looseSkuKeys.has(nk)) {
        const s = metaValueToSkuString(e.value);
        if (s) return s;
      }
    }
  }

  return extractLineItemSku(item);
}

/**
 * Line items for customer dashboard: Woo `total` / `subtotal` are authoritative for row amounts.
 */
function normalizeLineItems(
  items: unknown,
  source: "woo" | "legacy",
): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return [];
  return items.map((item: Record<string, unknown>) => {
    const name = String(
      item.name ?? item.product_name ?? (item.product && typeof item.product === "object"
        ? String((item.product as { name?: string }).name ?? "")
        : ""),
    );
    const qty = Number(item.quantity ?? item.qty) || 0;
    const unitPrice =
      item.price != null && String(item.price).trim() !== ""
        ? String(item.price)
        : item.unit_price != null && String(item.unit_price).trim() !== ""
          ? String(item.unit_price)
          : "0";

    let lineTotal = "";
    if (item.total != null && String(item.total).trim() !== "") {
      lineTotal = String(item.total);
    } else if (item.subtotal != null && String(item.subtotal).trim() !== "") {
      lineTotal = String(item.subtotal);
    } else if (item.line_total != null && String(item.line_total).trim() !== "") {
      lineTotal = String(item.line_total);
    } else {
      const u = parseFloat(unitPrice);
      lineTotal = Number.isFinite(u) ? (u * qty).toFixed(2) : "0";
    }

    const img =
      item.image ??
      (item.product && typeof item.product === "object"
        ? (item.product as { image?: unknown }).image
        : undefined);
    let image: { src: string; alt: string } | undefined;
    if (img && typeof img === "object" && img !== null && "src" in img) {
      const src = String((img as { src?: string }).src || "");
      if (src) {
        image = { src, alt: String((img as { alt?: string }).alt || name) };
      }
    } else if (typeof img === "string" && img.trim()) {
      image = { src: img.trim(), alt: name };
    }

    const sku =
      source === "legacy" ? extractLegacyLineItemSku(item) : extractLineItemSku(item);
    let productId = Number(item.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      const p = item.product;
      if (p && typeof p === "object" && p !== null) {
        const fromNested = Number((p as Record<string, unknown>).id);
        if (Number.isFinite(fromNested) && fromNested > 0) productId = fromNested;
        else productId = 0;
      } else {
        productId = 0;
      }
    }
    const variationIdRaw = Number(item.variation_id ?? 0);
    const variationId = Number.isFinite(variationIdRaw) && variationIdRaw > 0 ? variationIdRaw : 0;

    return {
      id: Number(item.id) || 0,
      name,
      quantity: qty,
      price: unitPrice,
      line_total: lineTotal,
      ...(sku ? { sku } : {}),
      ...(productId > 0 && source === "woo" ? { product_id: productId } : {}),
      ...(variationId > 0 && source === "woo" ? { variation_id: variationId } : {}),
      image,
    };
  });
}

function normalizeShippingLines(raw: Record<string, unknown>): Array<{
  method_title: string;
  total: string;
}> {
  const sl = raw.shipping_lines;
  if (Array.isArray(sl) && sl.length > 0) {
    return sl.map((x: Record<string, unknown>) => ({
      method_title: String(x.method_title ?? x.title ?? ""),
      total: String(x.total ?? "0"),
    }));
  }
  const title = String(
    (raw as { shipping_method_title?: string }).shipping_method_title ||
      (raw as { shipping_method?: string }).shipping_method ||
      "",
  ).trim();
  if (title) return [{ method_title: title, total: "0" }];
  return [];
}

/**
 * Single shape for GET /api/dashboard/orders/[id] and the order detail page.
 */
export function formatDashboardOrderDetail(
  raw: Record<string, unknown>,
  source: "woo" | "legacy",
): Record<string, unknown> {
  const billing = normalizeBilling(raw.billing);
  const shipping = normalizeShipping(raw.shipping);
  const currency = String(raw.currency || "AUD");
  const lineSource =
    source === "legacy" ? (raw.line_items ?? raw.items) : raw.line_items;
  const line_items = normalizeLineItems(lineSource, source);
  const machship_tracking_token = extractMachshipTrackingTokenFromOrderMeta(
    Array.isArray(raw.meta_data)
      ? (raw.meta_data as Array<{ key?: string; value?: unknown }>)
      : undefined,
  );

  return {
    id: Number(raw.id) || 0,
    order_number: String(raw.number ?? raw.order_number ?? raw.id ?? ""),
    status: String(raw.status ?? ""),
    date_created: String(raw.date_created ?? raw.date ?? ""),
    total: String(raw.total ?? "0"),
    currency,
    payment_method: String(raw.payment_method ?? ""),
    payment_method_title: String(raw.payment_method_title ?? raw.payment_method ?? ""),
    shipping_lines: normalizeShippingLines(raw),
    billing,
    shipping,
    line_items,
    source,
    ...(machship_tracking_token ? { machship_tracking_token } : {}),
  };
}
