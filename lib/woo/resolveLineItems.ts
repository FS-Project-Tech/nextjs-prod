import { wcGet } from "@/lib/woocommerce/wc-fetch";
import { validateProduct, validateVariation } from "@/lib/woo/validateProduct";
import { resolveProductRefBySku, type SkuResolveResult } from "@/lib/woo/resolveSku";

function isSkuResolveFailure(result: SkuResolveResult): result is { ok: false; message: string } {
  return result.ok === false;
}

export type RequestedLineItem = {
  product_id?: number;
  variation_id?: number;
  quantity: number;
  /** When set, Woo ids are resolved from SKU first (keeps checkout in sync with catalog). */
  sku?: string;
};

export type ResolvedLineItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
};

type UnavailableRow = {
  product_id: number;
  variation_id: number | null;
  sku?: string | null;
  reason: string;
};

type ResolveResult =
  | { ok: true; line_items: ResolvedLineItem[] }
  | {
      ok: false;
      unavailableItems: UnavailableRow[];
    };

type OneResult = { kind: "resolved"; line: ResolvedLineItem } | { kind: "unavailable"; row: UnavailableRow };

/** Dedupe parallel variation-list reads when multiple lines share a variable parent. */
function createVariationsListLoader(): (parentId: number) => Promise<unknown[]> {
  const cache = new Map<number, Promise<unknown[]>>();
  return (parentId: number) => {
    let p = cache.get(parentId);
    if (!p) {
      p = (async () => {
        try {
          const { data: varData } = await wcGet<unknown[]>(
            `/products/${parentId}/variations`,
            { per_page: 100 },
            "noStore",
          );
          return Array.isArray(varData) ? varData : [];
        } catch {
          return [];
        }
      })();
      cache.set(parentId, p);
    }
    return p;
  };
}

async function resolveOneWooLineItem(
  item: RequestedLineItem,
  loadVariations: (parentId: number) => Promise<unknown[]>,
): Promise<OneResult> {
  const quantity = Number(item.quantity || 0);
  const skuTrim = typeof item.sku === "string" ? item.sku.trim() : "";
  let productId = Number(item.product_id || 0);
  let requestedVariationId = item.variation_id != null ? Number(item.variation_id || 0) : 0;

  if (quantity <= 0) {
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: "Invalid quantity.",
      },
    };
  }

  if (skuTrim) {
    const fromSku = await resolveProductRefBySku(skuTrim, productId > 0 ? productId : undefined);
    if (isSkuResolveFailure(fromSku)) {
      if (productId <= 0) {
        return {
          kind: "unavailable",
          row: {
            product_id: 0,
            variation_id: null,
            sku: skuTrim,
            reason: fromSku.message,
          },
        };
      }
    } else {
      productId = fromSku.product_id;
      if (fromSku.variation_id && fromSku.variation_id > 0) {
        requestedVariationId = fromSku.variation_id;
      }
    }
  }

  if (productId <= 0) {
    return {
      kind: "unavailable",
      row: {
        product_id: 0,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: "Missing product_id and resolvable SKU.",
      },
    };
  }

  const check = await validateProduct(productId);
  if (check.ok === false) {
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: check.error.message,
      },
    };
  }

  const type = check.product.type;
  if (type === "grouped" || type === "external" || type === "bundle") {
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: `Unsupported product type "${type}" for direct checkout.`,
      },
    };
  }

  /** Woo may return a variation as `/products/{id}`; treat as parent + variation_id for line items. */
  if (type === "variation") {
    const parentFromWoo = check.product.parent_id;
    if (parentFromWoo != null && parentFromWoo > 0) {
      return {
        kind: "resolved",
        line: {
          product_id: parentFromWoo,
          variation_id: check.product.id,
          quantity,
        },
      };
    }
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: "Variation product is missing parent_id in Woo; cannot build checkout line.",
      },
    };
  }

  if (type !== "variable") {
    return {
      kind: "resolved",
      line: {
        product_id: productId,
        quantity,
      },
    };
  }

  let finalVariationId = requestedVariationId;
  if (finalVariationId <= 0) {
    const variations = await loadVariations(productId);
    let firstValid = null as Record<string, unknown> | null;
    if (skuTrim) {
      firstValid =
        (variations.find(
          (v) =>
            String((v as { sku?: string })?.sku ?? "").trim() === skuTrim &&
            String((v as { status?: string })?.status || "") === "publish" &&
            Boolean((v as { purchasable?: boolean })?.purchasable) &&
            String((v as { price?: string })?.price ?? "").trim(),
        ) as Record<string, unknown> | null) || null;
    }
    if (!firstValid) {
      firstValid =
        (variations.find((v) => {
          const status = String((v as { status?: string })?.status || "");
          const purchasable = Boolean((v as { purchasable?: boolean })?.purchasable);
          const price = String((v as { price?: string })?.price ?? "").trim();
          return status === "publish" && purchasable && Boolean(price);
        }) as Record<string, unknown> | undefined) || null;
    }
    finalVariationId = Number(firstValid?.id || 0);
  }

  if (finalVariationId <= 0) {
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: null,
        sku: skuTrim || null,
        reason: "Variable product requires a valid variation_id.",
      },
    };
  }

  const vcheck = await validateVariation(productId, finalVariationId);
  if (vcheck.ok === false) {
    return {
      kind: "unavailable",
      row: {
        product_id: productId,
        variation_id: finalVariationId,
        sku: skuTrim || null,
        reason: vcheck.error.message,
      },
    };
  }

  return {
    kind: "resolved",
    line: {
      product_id: productId,
      variation_id: finalVariationId,
      quantity,
    },
  };
}

export async function resolveWooLineItems(items: RequestedLineItem[]): Promise<ResolveResult> {
  const forceSimpleId = Number(process.env.WOO_DEBUG_FORCE_SIMPLE_PRODUCT_ID || 0);
  const effectiveItems =
    forceSimpleId > 0 ? [{ product_id: forceSimpleId, quantity: 1 } as RequestedLineItem] : items;

  const loadVariations = createVariationsListLoader();
  const results = await Promise.all(
    effectiveItems.map((item) => resolveOneWooLineItem(item, loadVariations)),
  );

  const unavailable: UnavailableRow[] = [];
  const resolved: ResolvedLineItem[] = [];
  for (const r of results) {
    if (r.kind === "unavailable") unavailable.push(r.row);
    else resolved.push(r.line);
  }

  if (unavailable.length > 0) {
    return {
      ok: false,
      unavailableItems: unavailable,
    };
  }

  return { ok: true, line_items: resolved };
}
