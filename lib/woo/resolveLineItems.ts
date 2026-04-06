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

type ResolveResult =
  | { ok: true; line_items: ResolvedLineItem[] }
  | {
      ok: false;
      unavailableItems: Array<{
        product_id: number;
        variation_id: number | null;
        sku?: string | null;
        reason: string;
      }>;
    };

export async function resolveWooLineItems(items: RequestedLineItem[]): Promise<ResolveResult> {
  const resolved: ResolvedLineItem[] = [];
  const unavailable: Array<{
    product_id: number;
    variation_id: number | null;
    sku?: string | null;
    reason: string;
  }> = [];

  const forceSimpleId = Number(process.env.WOO_DEBUG_FORCE_SIMPLE_PRODUCT_ID || 0);
  const effectiveItems =
    forceSimpleId > 0 ? [{ product_id: forceSimpleId, quantity: 1 } as RequestedLineItem] : items;

  for (const item of effectiveItems) {
    const quantity = Number(item.quantity || 0);
    const skuTrim = typeof item.sku === "string" ? item.sku.trim() : "";
    let productId = Number(item.product_id || 0);
    let requestedVariationId = item.variation_id != null ? Number(item.variation_id || 0) : 0;

    if (quantity <= 0) {
      unavailable.push({
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: "Invalid quantity.",
      });
      continue;
    }

    if (skuTrim) {
      const fromSku = await resolveProductRefBySku(skuTrim, productId > 0 ? productId : undefined);
      if (isSkuResolveFailure(fromSku)) {
        if (productId <= 0) {
          unavailable.push({
            product_id: 0,
            variation_id: null,
            sku: skuTrim,
            reason: fromSku.message,
          });
          continue;
        }
      } else {
        productId = fromSku.product_id;
        if (fromSku.variation_id && fromSku.variation_id > 0) {
          requestedVariationId = fromSku.variation_id;
        }
      }
    }

    if (productId <= 0) {
      unavailable.push({
        product_id: 0,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: "Missing product_id and resolvable SKU.",
      });
      continue;
    }

    const check = await validateProduct(productId);
    if (check.ok === false) {
      unavailable.push({
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: check.error.message,
      });
      continue;
    }

    const type = check.product.type;
    if (type === "grouped" || type === "external" || type === "bundle") {
      unavailable.push({
        product_id: productId,
        variation_id: requestedVariationId || null,
        sku: skuTrim || null,
        reason: `Unsupported product type "${type}" for direct checkout.`,
      });
      continue;
    }

    if (type !== "variable") {
      resolved.push({
        product_id: productId,
        quantity,
      });
      continue;
    }

    // Variable product: must include a valid variation_id.
    let finalVariationId = requestedVariationId;
    if (finalVariationId <= 0) {
      try {
        const { data: varData } = await wcGet<unknown[]>(
          `/products/${productId}/variations`,
          { per_page: 100 },
          "noStore",
        );
        const variations = Array.isArray(varData) ? varData : [];
        let firstValid = null as any;
        if (skuTrim) {
          firstValid = variations.find(
            (v: any) =>
              String(v?.sku ?? "").trim() === skuTrim &&
              String(v?.status || "") === "publish" &&
              Boolean(v?.purchasable) &&
              String(v?.price ?? "").trim()
          );
        }
        if (!firstValid) {
          firstValid = variations.find((v: any) => {
            const status = String(v?.status || "");
            const purchasable = Boolean(v?.purchasable);
            const price = String(v?.price ?? "").trim();
            return status === "publish" && purchasable && price;
          });
        }
        finalVariationId = Number(firstValid?.id || 0);
      } catch {
        finalVariationId = 0;
      }
    }

    if (finalVariationId <= 0) {
      unavailable.push({
        product_id: productId,
        variation_id: null,
        sku: skuTrim || null,
        reason: "Variable product requires a valid variation_id.",
      });
      continue;
    }

    const vcheck = await validateVariation(productId, finalVariationId);
    if (vcheck.ok === false) {
      unavailable.push({
        product_id: productId,
        variation_id: finalVariationId,
        sku: skuTrim || null,
        reason: vcheck.error.message,
      });
      continue;
    }

    resolved.push({
      product_id: productId,
      variation_id: finalVariationId,
      quantity,
    });
  }

  if (unavailable.length > 0) {
    return {
      ok: false,
      unavailableItems: unavailable,
    };
  }

  return { ok: true, line_items: resolved };
}
