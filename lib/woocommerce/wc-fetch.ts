import "server-only";

/**
 * Central WooCommerce REST GET using native fetch + Next.js Data Cache (revalidate).
 * Mutations and session-sensitive reads should use axios `wcAPI` or `cache: "no-store"` here.
 */
export const WOO_REVALIDATE_SECONDS = {
  /** Product lists, attributes, terms, reviews, multi-product queries */
  products: 300,
  /** /products/categories only */
  categories: 30 * 60,
  /** Single product, slug lookup, variations */
  product: 60,
} as const;

export type WooCacheProfile = keyof typeof WOO_REVALIDATE_SECONDS | "noStore";

export type WcGetResult<T> = {
  data: T;
  status: number;
  wpTotal?: number;
  wpTotalPages?: number;
};

function cacheInitForProfile(profile: WooCacheProfile): Pick<RequestInit, "cache" | "next"> {
  if (profile === "noStore") {
    return { cache: "no-store" };
  }
  return { next: { revalidate: WOO_REVALIDATE_SECONDS[profile] } };
}

function serializeParamValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Build WooCommerce REST GET URL with consumer key/secret (query auth).
 */
export function buildWcGetUrl(path: string, params?: Record<string, unknown>): URL {
  const base = process.env.WC_API_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("WC_API_URL is not configured");
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${p}`);
  const key = process.env.WC_CONSUMER_KEY || "";
  const secret = process.env.WC_CONSUMER_SECRET || "";
  url.searchParams.set("consumer_key", key);
  url.searchParams.set("consumer_secret", secret);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const s = serializeParamValue(v);
      if (s !== undefined) url.searchParams.set(k, s);
    }
  }
  return url;
}

/**
 * Typed error so existing `error?.response?.status` checks keep working.
 */
export function attachAxiosLikeResponse(
  err: Error,
  status: number,
  data: unknown,
  url: string,
): Error {
  (err as Error & { response?: { status: number; data: unknown; config: { url: string } } }).response =
    { status, data, config: { url } };
  return err;
}

/**
 * GET JSON from WooCommerce REST with revalidation or no-store.
 */
export async function wcGet<T = unknown>(
  path: string,
  params: Record<string, unknown> | undefined,
  profile: WooCacheProfile,
  init?: Omit<RequestInit, "method" | "body">,
): Promise<WcGetResult<T>> {
  const url = buildWcGetUrl(path, params);
  const timeoutMs = Number.parseInt(process.env.WOOCOMMERCE_API_TIMEOUT || "30000", 10);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headerBase =
      init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)
        : {};
    const { headers: _h, signal: _s, ...restInit } = init || {};
    const res = await fetch(url.toString(), {
      method: "GET",
      ...restInit,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headerBase,
      },
      ...cacheInitForProfile(profile),
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const msg =
        data &&
        typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : text.slice(0, 200);
      const err = attachAxiosLikeResponse(
        new Error(`WooCommerce GET ${res.status}: ${msg}`),
        res.status,
        data,
        url.toString(),
      );
      throw err;
    }

    const wpTotal = res.headers.get("x-wp-total");
    const wpTotalPages = res.headers.get("x-wp-totalpages");

    return {
      data: data as T,
      status: res.status,
      wpTotal: wpTotal ? Number.parseInt(wpTotal, 10) : undefined,
      wpTotalPages: wpTotalPages ? Number.parseInt(wpTotalPages, 10) : undefined,
    };
  } finally {
    clearTimeout(t);
  }
}
