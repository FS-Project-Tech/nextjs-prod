import type { CheckoutCatalogRow } from "@/lib/woo/batchCheckoutCatalog";
import {
  batchFetchCheckoutCatalogLines,
  catalogLineKey,
} from "@/lib/woo/batchCheckoutCatalog";

const TTL_MS = 45_000;
const MAX_ENTRIES = 200;

type CacheEntry = { expiresAt: number; map: Map<string, CheckoutCatalogRow> };

const cache = new Map<string, CacheEntry>();

function legacyCatalogCacheKey(
  lines: Array<{ product_id: number; variation_id?: number }>,
): string {
  const parts = lines.map((li) => catalogLineKey(li.product_id, li.variation_id));
  return [...new Set(parts)].sort().join(",");
}

function normVariationId(v?: number): number {
  return v != null && v > 0 ? v : 0;
}

/**
 * When currency + customer pricing context are both present, segment the cache by line and
 * pricing context. If any input is missing, callers must use {@link legacyCatalogCacheKey} only.
 */
function enhancedCatalogCacheKey(
  lines: Array<{ product_id: number; variation_id?: number }>,
  currency: string,
  customerType: string,
): string {
  const ccy = currency.trim();
  const ctx = customerType.trim();
  const parts = lines.map(
    (li) => `${li.product_id}-${normVariationId(li.variation_id)}-${ccy}-${ctx}`,
  );
  return [...new Set(parts)].sort().join(",");
}

function resolveCacheKey(
  lines: Array<{ product_id: number; variation_id?: number }>,
  meta?: { currency?: string; customerType?: string },
): string {
  const ccy = meta?.currency?.trim();
  const ctx = meta?.customerType?.trim();
  if (ccy && ccy.length > 0 && ctx && ctx.length > 0) {
    return enhancedCatalogCacheKey(lines, ccy, ctx);
  }
  return legacyCatalogCacheKey(lines);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

export type CheckoutCatalogCacheMeta = {
  currency?: string;
  customerType?: string;
  requestId?: string;
};

/**
 * Batch checkout catalog fetch with a short in-memory TTL to cut repeated Woo round-trips.
 * On cache read/write failure, falls through to a fresh {@link batchFetchCheckoutCatalogLines} call.
 */
export async function fetchCheckoutCatalogCached(
  lines: Array<{ product_id: number; variation_id?: number }>,
  meta?: CheckoutCatalogCacheMeta,
): Promise<Map<string, CheckoutCatalogRow>> {
  if (lines.length === 0) return new Map();

  const key = resolveCacheKey(lines, meta);

  if (process.env.NODE_ENV !== "test") {
    try {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return new Map(hit.map);
      }
    } catch (e) {
      console.warn("[checkout-catalog-cache] read failed, fetching fresh", {
        requestId: meta?.requestId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    const map = await batchFetchCheckoutCatalogLines(lines);
    if (process.env.NODE_ENV !== "test") {
      try {
        pruneExpired();
        cache.set(key, { expiresAt: Date.now() + TTL_MS, map: new Map(map) });
        while (cache.size > MAX_ENTRIES) {
          const first = cache.keys().next().value as string | undefined;
          if (!first) break;
          cache.delete(first);
        }
      } catch (e) {
        console.warn("[checkout-catalog-cache] write failed (non-fatal)", {
          requestId: meta?.requestId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return map;
  } catch (e) {
    console.warn("[checkout-catalog-cache] batch fetch failed", {
      requestId: meta?.requestId,
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
