# 📦 Next.js Fetch Helper – Caching, SWR, Dedupe

File: `lib/fetcher.ts`

## Features

- ✅ In-memory SSR cache (per request) with configurable TTL
- ✅ Request deduplication (concurrent identical fetches share a single promise)
- ✅ Hooks into `fetch` cache / ISR via `next: { revalidate }`
- ✅ Optional `stale-while-revalidate` behavior by combining memory + ISR
- ✅ Works with existing instrumentation/logging

## Usage

```typescript
import { fetchWithCache } from '@/lib/fetcher';

// In server component or API route
const products = await fetchWithCache(`${process.env.WC_API_URL}/products`, {
  method: 'GET',
  cacheKey: `products_page_${page}`,
  ttl: 60_000,         // 60 seconds SSR memory cache
  revalidate: 300,     // 5 min ISR / fetch cache
  dedupe: true,        // default
  route: '/api/products', // optional route name for logging
});
```

### Options

| Option            | Type        | Default | Description |
|-------------------|-------------|---------|-------------|
| `ttl`             | `number`    | 30000   | Memory cache TTL in ms (server only) |
| `dedupe`          | `boolean`   | `true`  | Deduplicate concurrent identical requests |
| `cacheKey`        | `string`    | auto    | Custom cache key (otherwise derived from URL+body) |
| `bypassMemoryCache` | `boolean` | `false` | Skip SSR memory cache (still uses fetch cache/ISR) |
| `revalidate`      | `number`    | -       | `next: { revalidate }` seconds (ISR) |
| `fetchCache`      | `'force-cache' \| 'no-store' \| ...` | - | Force fetch cache mode |
| `returnResponse`  | `boolean`   | `false` | Return raw `Response` instead of parsed JSON |
| `route`           | `string`    | -       | Route name for instrumentation logs |

## Patterns

### 1. Server Component with ISR

```typescript
export const revalidate = 300; // 5 minutes (Next.js-level)

export default async function Page() {
  const data = await fetchWithCache(`${API}/products`, {
    ttl: 30_000,         // 30s memory cache
    revalidate: 300,     // 5 min ISR
  });
  return <ProductGrid data={data} />;
}
```

### 2. API Route (dedupe + memory cache)

```typescript
export const GET = async () => {
  const [products, categories] = await Promise.all([
    fetchWithCache(`${API}/products`, { cacheKey: 'products', ttl: 60_000, route: '/api/products' }),
    fetchWithCache(`${API}/categories`, { cacheKey: 'categories', ttl: 60_000, route: '/api/products' }),
  ]);

  return NextResponse.json({ products, categories });
};
```

### 3. Client Side (falls back to native SWR)

```typescript
'use client';

import useSWR from 'swr';
import { fetchWithCache } from '@/lib/fetcher';

const fetcher = (url: string) => fetchWithCache(url, { dedupe: true, ttl: 0 });

export function ProductsClient() {
  const { data } = useSWR('/api/products', fetcher);
  // ...
}
```

## How it works

1. Builds a cache key from URL + method + body (or uses `cacheKey`)
2. Checks SSR memory cache (`Map` stored on `globalThis`) if running on server
3. Deduplicates concurrent requests via shared promise map
4. Uses `instrumentedFetch` under the hood (logging, route mapping, etc.)
5. Optionally sets `next: { revalidate }` to leverage Next.js fetch cache/ISR
6. Writes JSON result into memory cache (server) with TTL

## Notes

- Memory cache only exists during SSR (per request lifecycle)
- For cross-request caching use Redis/Next fetch cache
- Works alongside existing instrumentation and caching layers
- Use `revalidate` + `ttl` together for SWR-like semantics:
  - Memory cache gives instant response during SSR
  - Next/ISR revalidates in background

## Migration plan

1. Replace direct `fetch` / `wcAPI` calls in server components & API routes with `fetchWithCache`
2. Use consistent `cacheKey` naming for shared resources (e.g., `products_page_1`)
3. Gradually tune `ttl`/`revalidate` based on endpoint freshness requirements
4. Monitor `/api/performance/report` to verify fewer duplicate requests + lower latency

