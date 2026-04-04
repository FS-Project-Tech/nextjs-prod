/**
 * Public CMS helpers (no WooCommerce consumer keys).
 */

export interface ApiFetchOptions<T = unknown> {
  timeout?: number;
  retries?: number;
  fallback?: T;
  enableLogging?: boolean;
}

const wpOrigin = () => process.env.NEXT_PUBLIC_WP_URL;

export async function apiFetchJson<T>(url: string, options: ApiFetchOptions<T> = {}): Promise<T> {
  const { timeout = 5000, retries = 0, fallback, enableLogging = false } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (enableLogging) {
        console.warn(`[api] ${url} attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);
      }
      if (attempt === retries && fallback !== undefined) return fallback;
    }
  }

  if (fallback !== undefined) return fallback;
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

export async function getMarketingUpdates() {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(`${base}/wp-json/acf/v3/options/options`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to fetch marketing updates");
  return res.json();
}

export async function getFeaturedCategories() {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(`${base}/wp-json/acf/v3/options/options`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to fetch featured categories");
  return res.json();
}

export async function getBrandsFromCustomEndpoint() {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(`${base}/wp-json/custom/v1/brands`, { next: { revalidate: 60 } });
  const payload = await res.json();
  return Array.isArray(payload) ? payload : [];
}

export async function getBrandRecordBySlug(slug: string) {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(`${base}/wp-json/wp/v2/product_brand?slug=${encodeURIComponent(slug)}`);
  const payload = await res.json();
  return Array.isArray(payload) ? payload[0] : null;
}

export const fetchBrands = async () => {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(`${base}/wp-json/custom/v1/brands`, { next: { revalidate: 60 } });
  return res.json();
};

export const fetchBrandWithProducts = async (slug: string) => {
  const base = wpOrigin();
  if (!base) throw new Error("NEXT_PUBLIC_WP_URL missing");
  const res = await fetch(
    `${base}/wp-json/custom/v1/brands?slug=${encodeURIComponent(slug)}&include_products=1`,
    { next: { revalidate: 60 } }
  );
  const payload = await res.json();
  return Array.isArray(payload) ? payload[0] ?? null : null;
};
