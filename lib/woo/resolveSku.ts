import { wcGet } from "@/lib/woocommerce/wc-fetch";

export type SkuResolveResult =
  | {
      ok: true;
      product_id: number;
      variation_id?: number;
      source: "product_by_sku" | "variation_under_parent";
    }
  | { ok: false; message: string };

/**
 * Resolve Woo line-item ids from a catalog SKU.
 * 1) GET /products?sku=… (simple products; variable parents whose SKU matches).
 * 2) If not found, optionally scan GET /products/{parentHint}/variations (variation SKUs).
 */
export async function resolveProductRefBySku(
  sku: string,
  parentIdHint?: number
): Promise<SkuResolveResult> {
  const s = String(sku || "").trim();
  if (!s) {
    return { ok: false, message: "SKU is empty." };
  }

  try {
    const { data } = await wcGet<unknown[]>(
      "/products",
      { sku: s, per_page: 20, status: "publish" },
      "noStore",
    );
    const list = Array.isArray(data) ? data : [];
    const exact = list.filter((p: { sku?: string }) => String(p?.sku ?? "").trim() === s);

    if (exact.length > 1) {
      return {
        ok: false,
        message: `Multiple published products share SKU "${s}".`,
      };
    }

    if (exact.length === 1) {
      const p = exact[0] as { id?: number; type?: string };
      const id = Number(p.id || 0);
      if (id <= 0) {
        return { ok: false, message: `Invalid product row for SKU "${s}".` };
      }
      return {
        ok: true,
        product_id: id,
        source: "product_by_sku",
      };
    }
  } catch (e) {
    console.warn("[woo] resolveSku: /products?sku lookup failed", e);
  }

  const hint =
    parentIdHint != null && Number.isFinite(parentIdHint) && parentIdHint > 0 ? parentIdHint : 0;
  if (hint > 0) {
    try {
      const { data } = await wcGet<unknown[]>(
        `/products/${hint}/variations`,
        { per_page: 100 },
        "noStore",
      );
      const vars = Array.isArray(data) ? data : [];
      const hit = vars.find((v: { sku?: string }) => String(v?.sku ?? "").trim() === s) as
        | { id?: number }
        | undefined;
      const vid = Number(hit?.id || 0);
      if (vid > 0) {
        return {
          ok: true,
          product_id: hint,
          variation_id: vid,
          source: "variation_under_parent",
        };
      }
    } catch (e) {
      console.warn("[woo] resolveSku: variation scan failed", e);
    }
  }

  return {
    ok: false,
    message: `No published product found for SKU "${s}".`,
  };
}
