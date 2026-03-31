/**
 * API fetch utilities for client-side requests
 * Used by Header and other components for CMS/API calls with timeout, retries, and fallback
 */

export interface ApiFetchOptions<T = unknown> {
  timeout?: number;
  retries?: number;
  fallback?: T;
  enableLogging?: boolean;  
}

const BASE_URL = process.env.NEXT_PUBLIC_WP_URL;

/**
 * Fetch JSON from a URL with timeout, retries, and optional fallback
 */
export async function apiFetchJson<T>(
  url: string,
  options: ApiFetchOptions<T> = {}
): Promise<T> {
  const { timeout = 5000, retries = 0, fallback, enableLogging = false } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as T;
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (enableLogging) {
        console.warn(`[api] ${url} attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);
      }
      if (attempt === retries && fallback !== undefined) {
        return fallback;
      }
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

export async function getMarketingUpdates() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/acf/v3/options/options`,
    {
      next: { revalidate: 300 }, // cache 5 min
    }
  )

  if (!res.ok) throw new Error("Failed to fetch marketing updates")

  return res.json()
}

export async function getFeaturedCategories() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/acf/v3/options/options`,
    {
      next: { revalidate: 300 }, // cache 5 min
    }
  )

  if (!res.ok) throw new Error("Failed to fetch marketing updates")

  return res.json()
}


export async function getProducts() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/wc/v3/products?per_page=5&_fields=id,name,slug,price,images`,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
          ).toString("base64"),
      },
      next: { revalidate: 60 }, // ISR (important for performance)
    }
  )

  if (!res.ok) throw new Error("Failed to fetch products")

  return res.json()
}

export async function getBrands() {
  const res = await fetch(
    `${BASE_URL}/api/filters/brands`,
    { next: { revalidate: 60 } }
  );

  return res.json();
}

export async function getBrandBySlug(slug: string) {
  const res = await fetch(
    `${BASE_URL}/wp-json/wp/v2/product_brand?slug=${slug}`
  );

  const data = await res.json();
  return data[0];
}

export async function getProductsByBrand(brandId: number) {
  const res = await fetch(
    `${BASE_URL}/wp-json/wc/v3/products?product_brand=${brandId}&per_page=20`,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.WC_CONSUMER_KEY + ":" + process.env.WC_CONSUMER_SECRET
          ).toString("base64"),
      },
      next: { revalidate: 60 },
    }
  );

  return res.json();
}




// ✅ Get all brands
export const fetchBrands = async () => {
  const res = await fetch(`${BASE_URL}/wp-json/custom/v1/brands`, {
    next: { revalidate: 60 },
  });

  return res.json();
};

// ✅ Get single brand + products
export const fetchBrandWithProducts = async (slug: string) => {

  console.log("Slug:", slug);

  const res = await fetch(
    `${BASE_URL}/wp-json/custom/v1/brands?slug=${encodeURIComponent(slug)}&include_products=1`,
    {
      next: { revalidate: 60 },
    }
  );
  console.log("Response:", res);

  const data = await res.json();
  console.log("API:", data);

  // your API returns array → take first item
  return data?.[0] || null;
};