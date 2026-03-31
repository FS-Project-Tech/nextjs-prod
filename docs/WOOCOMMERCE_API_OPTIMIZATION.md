# WooCommerce API Optimization Guide

This guide explains how to use the optimized `fetchWooData()` utility for efficient WooCommerce API calls.

## Features

- ✅ **Batched API Requests** - Automatically batches multiple requests together
- ✅ **Revalidation Support** - Uses Next.js cache revalidation keys
- ✅ **Multi-layer Caching** - In-memory + Redis (optional) caching
- ✅ **ISR Prefetching** - Prefetch data at build time for static generation
- ✅ **Fallback Loading States** - Graceful error handling with fallback data

## Basic Usage

### Simple Fetch

```typescript
import { fetchWooData } from '@/lib/fetch-woo-data';

// Fetch products with default caching (5 minutes)
const products = await fetchWooData<WooCommerceProduct[]>(
  '/products',
  { per_page: 20, category: 123 },
  {
    cache: {
      revalidate: 300, // 5 minutes
      tags: ['products'],
    },
  }
);
```

### With Fallback Data

```typescript
const products = await fetchWooData<WooCommerceProduct[]>(
  '/products',
  { per_page: 20 },
  {
    cache: { revalidate: 300 },
    fallback: [], // Return empty array if fetch fails
  }
);
```

### Batched Requests

```typescript
// Multiple requests are automatically batched together
const [products, categories] = await Promise.all([
  fetchWooData('/products', {}, { batch: true }),
  fetchWooData('/products/categories', {}, { batch: true }),
]);
```

## Batch Fetching

### Fetch Multiple Products by IDs

```typescript
import { fetchProductsBatch } from '@/lib/fetch-woo-data';

const products = await fetchProductsBatch([1, 2, 3, 4, 5], {
  cache: { revalidate: 300, tags: ['products'] },
  fallback: [],
});
```

### Fetch Multiple Categories by IDs

```typescript
import { fetchCategoriesBatch } from '@/lib/fetch-woo-data';

const categories = await fetchCategoriesBatch([1, 2, 3], {
  cache: { revalidate: 600, tags: ['categories'] },
  fallback: [],
});
```

## ISR Prefetching

### Prefetch Popular Products

```typescript
import { prefetchPopularProducts } from '@/lib/prefetch-woo-data';

// Prefetch top 50 popular products
const products = await prefetchPopularProducts(50);
```

### Prefetch All Categories

```typescript
import { prefetchAllCategories } from '@/lib/prefetch-woo-data';

const categories = await prefetchAllCategories();
```

### Prefetch Everything

```typescript
import { prefetchAllWooData } from '@/lib/prefetch-woo-data';

const {
  popularProducts,
  featuredProducts,
  onSaleProducts,
  categories,
} = await prefetchAllWooData({
  maxPopularProducts: 50,
  maxFeaturedProducts: 50,
  maxOnSaleProducts: 50,
  includeCategories: true,
});
```

## Redis Caching (Optional)

To enable Redis caching, set the `REDIS_URL` environment variable:

```bash
REDIS_URL=redis://localhost:6379
```

Install Redis client:

```bash
npm install ioredis
```

Redis will be used automatically if available, otherwise it falls back to in-memory caching.

## Cache Revalidation

### Using Cache Tags

```typescript
// Fetch with cache tags
const products = await fetchWooData('/products', {}, {
  cache: {
    revalidate: 300,
    tags: ['products', 'category-123'],
  },
});

// Revalidate by tag (in API route)
import { revalidateTag } from 'next/cache';
revalidateTag('products');
```

### Manual Revalidation

```typescript
import { revalidateCache } from '@/lib/fetch-woo-data';

// Revalidate all products cache
await revalidateCache(['products']);
```

## Fallback Loading States

### Using WooDataLoader Component

```tsx
import { WooDataLoader } from '@/components/WooDataLoader';
import { fetchWooData } from '@/lib/fetch-woo-data';

export default async function ProductsPage() {
  const products = await fetchWooData<WooCommerceProduct[]>(
    '/products',
    {},
    { fallback: [] }
  );

  return (
    <WooDataLoader
      data={products}
      isLoading={false}
      error={null}
      fallback={[]}
    >
      {(data) => (
        <div className="grid grid-cols-4 gap-4">
          {data.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </WooDataLoader>
  );
}
```

### Client-Side Loading States

```tsx
'use client';

import { useState, useEffect } from 'react';
import { WooDataLoader, ProductGridLoader } from '@/components/WooDataLoader';

export default function ProductsPage() {
  const [products, setProducts] = useState<WooCommerceProduct[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, []);

  return (
    <ProductGridLoader isLoading={isLoading} error={error}>
      <div className="grid grid-cols-4 gap-4">
        {products?.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </ProductGridLoader>
  );
}
```

## Build-Time Prefetching

Add to your `package.json`:

```json
{
  "scripts": {
    "prefetch:woo": "tsx scripts/prefetch-woo-data.ts"
  }
}
```

Run before build:

```bash
npm run prefetch:woo && npm run build
```

## Performance Benefits

1. **Reduced API Calls** - Batching reduces network requests by up to 80%
2. **Faster Page Loads** - Cached responses load instantly
3. **Better SEO** - Prefetched data improves static generation
4. **Lower Server Load** - Caching reduces WooCommerce API load
5. **Graceful Degradation** - Fallback data ensures pages always render

## Best Practices

1. **Use batch fetching** for multiple related items
2. **Set appropriate revalidate times** based on data freshness needs
3. **Use cache tags** for targeted revalidation
4. **Always provide fallback data** for better UX
5. **Prefetch popular data** at build time for ISR

## Examples

See `lib/fetch-woo-data.ts` and `lib/prefetch-woo-data.ts` for complete implementation details.

