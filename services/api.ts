import { cached } from "@/lib/cache";

type FetchJsonOptions = {
  cacheKey: string;
  ttlSeconds?: number;
  tags?: string[];
  skipCache?: boolean;
  timeoutMs?: number;
  retries?: number;
  init?: RequestInit;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Centralized JSON fetcher with:
 * - request deduplication and in-memory caching via lib/cache#cached
 * - timeout and retry support
 * - consistent error messages
 */
export async function fetchJsonCached<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const {
    cacheKey,
    ttlSeconds = 60,
    tags = [],
    skipCache = false,
    timeoutMs = 8000,
    retries = 1,
    init,
  } = options;

  return cached<T>(
    cacheKey,
    async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetchWithTimeout(
            url,
            {
              ...init,
              headers: {
                Accept: "application/json",
                ...(init?.headers || {}),
              },
              cache: "no-store",
            },
            timeoutMs
          );

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(
              `HTTP ${res.status} ${res.statusText}${errText ? `: ${errText.slice(0, 200)}` : ""}`
            );
          }
          return (await res.json()) as T;
        } catch (err) {
          lastErr = err;
          if (attempt >= retries) break;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Fetch failed");
    },
    {
      ttl: ttlSeconds,
      tags,
      skipCache,
    }
  );
}
