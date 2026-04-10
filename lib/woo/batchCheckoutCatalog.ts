import { wcGet } from "@/lib/woocommerce/wc-fetch";

const WOO_INCLUDE_CHUNK = 100;

export type CheckoutCatalogRow = Record<string, unknown>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Map key: `productId` or `productId:variationId` for variable lines. */
export function catalogLineKey(productId: number, variationId?: number): string {
  const v = variationId != null && variationId > 0 ? variationId : 0;
  return `${productId}:${v}`;
}

/**
 * Batch-fetch simple products and variations for checkout (one round-trip per chunk instead of N
 * sequential GETs per line item).
 */
export async function batchFetchCheckoutCatalogLines(
  lines: Array<{ product_id: number; variation_id?: number }>,
): Promise<Map<string, CheckoutCatalogRow>> {
  const map = new Map<string, CheckoutCatalogRow>();
  if (lines.length === 0) return map;

  const simpleProductIds = new Set<number>();
  const variationByParent = new Map<number, Set<number>>();

  for (const li of lines) {
    const vid = li.variation_id != null && li.variation_id > 0 ? li.variation_id : 0;
    if (vid > 0) {
      let set = variationByParent.get(li.product_id);
      if (!set) {
        set = new Set<number>();
        variationByParent.set(li.product_id, set);
      }
      set.add(vid);
    } else {
      simpleProductIds.add(li.product_id);
    }
  }

  const jobs: Promise<void>[] = [];

  for (const idChunk of chunk([...simpleProductIds], WOO_INCLUDE_CHUNK)) {
    if (idChunk.length === 0) continue;
    jobs.push(
      (async () => {
        const { data } = await wcGet<unknown[]>(
          "/products",
          {
            include: idChunk.join(","),
            per_page: WOO_INCLUDE_CHUNK,
            status: "publish",
          },
          "noStore",
        );
        const list = Array.isArray(data) ? data : [];
        for (const row of list) {
          const rec = row as CheckoutCatalogRow;
          const id = Number(rec.id || 0);
          if (id > 0) map.set(catalogLineKey(id, 0), rec);
        }
      })(),
    );
  }

  for (const [parentId, varSet] of variationByParent) {
    const ids = [...varSet];
    for (const idChunk of chunk(ids, WOO_INCLUDE_CHUNK)) {
      if (idChunk.length === 0) continue;
      jobs.push(
        (async () => {
          const { data } = await wcGet<unknown[]>(
            `/products/${parentId}/variations`,
            {
              include: idChunk.join(","),
              per_page: WOO_INCLUDE_CHUNK,
            },
            "noStore",
          );
          const list = Array.isArray(data) ? data : [];
          for (const row of list) {
            const rec = row as CheckoutCatalogRow;
            const vid = Number(rec.id || 0);
            if (vid > 0) map.set(catalogLineKey(parentId, vid), rec);
          }
        })(),
      );
    }
  }

  await Promise.all(jobs);
  return map;
}
