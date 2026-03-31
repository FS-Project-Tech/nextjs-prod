# 🎯 Next.js Performance Audit - Recommendations

## Based on Report Findings

### HIGH Priority

#### 1. Duplicate Requests
**Issue**: Same WordPress endpoint called multiple times within short window

**Detection:**
```bash
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.duplicates'
```

**Solution:**
- ✅ Already implemented: Request batching (`lib/api-batcher.ts`)
- Enable deduplication window
- Use React Query or SWR for client-side caching

**Code:**
```typescript
import { requestBatcher } from '@/lib/api-batcher';

// Automatic deduplication
const result = await requestBatcher.batch('key', () => fetchData());
```

#### 2. Sequential Fetches
**Issue**: Multiple fetches in sequence instead of parallel

**Detection:**
Check `avgFetchCount` in route metrics. If > 3, likely sequential.

**Solution:**
```typescript
// Before (sequential - slow)
const products = await fetchProducts();
const categories = await fetchCategories();
const tags = await fetchTags();

// After (parallel - fast)
const [products, categories, tags] = await Promise.all([
  fetchProducts(),
  fetchCategories(),
  fetchTags(),
]);
```

**Expected Improvement**: 50-70% reduction in total time

#### 3. Missing Caching
**Issue**: Same data fetched on every request

**Detection:**
Check cache hit rate in summary. If 0%, caching not working.

**Solution:**
- ✅ Already implemented: Redis caching (`lib/cache/redis-enhanced.ts`)
- Set `REDIS_URL` in `.env`
- Enable caching in API routes

**Code:**
```typescript
import { cacheGet, cacheSet } from '@/lib/cache/redis-enhanced';

// Check cache first
const cached = await cacheGet('products', cacheKey);
if (cached) return cached;

// Fetch and cache
const data = await fetchData();
await cacheSet('products', cacheKey, data);
```

**Expected Improvement**: 80-90% latency reduction for cached requests

### MEDIUM Priority

#### 4. Large Payloads
**Issue**: Fetching unnecessary fields

**Detection:**
Check payload sizes in report. If > 100KB, optimize.

**Solution:**
- ✅ Already implemented: Field selection (`lib/api-optimizer.ts`)
- Use `_fields` parameter
- Request only needed data

**Code:**
```typescript
import { optimizeProductParams } from '@/lib/api-optimizer';

const params = optimizeProductParams({ per_page: 24 }, 'list');
// Automatically adds _fields parameter
```

**Expected Improvement**: 50-70% payload reduction

#### 5. SSR for Dynamic Data
**Issue**: Server-side fetching on every request

**Solution:**
```typescript
// Before (SSR - fetches every time)
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// After (ISR - cached)
export const revalidate = 300; // 5 minutes
export default async function Page() {
  const data = await fetchData(); // Cached
  return <div>{data}</div>;
}

// Or client-side (SWR)
'use client';
import useSWR from 'swr';

export default function Page() {
  const { data } = useSWR('/api/data', fetcher);
  return <div>{data}</div>;
}
```

**Expected Improvement**: 80-95% reduction for cached pages

#### 6. Slow WordPress Endpoints
**Issue**: WP endpoint taking >500ms

**Solution:**
- Optimize WordPress queries
- Add database indexes
- Use GraphQL for complex queries
- Enable WordPress object cache

**Expected Improvement**: 50-80% reduction

### LOW Priority

#### 7. Unnecessary Re-renders
**Issue**: Components re-fetching on every render

**Solution:**
- Use React Query for client-side caching
- Implement proper memoization
- Use `useMemo` for expensive computations

#### 8. Large Bundle Sizes
**Issue**: Loading unnecessary code

**Solution:**
- Use dynamic imports
- Code splitting
- Tree shaking

---

## Implementation Checklist

### Immediate (Today)
- [ ] Set `REDIS_URL` in `.env`
- [ ] Review duplicate requests report
- [ ] Identify sequential fetch patterns

### Short-term (This Week)
- [ ] Convert sequential fetches to parallel
- [ ] Enable caching for slow endpoints
- [ ] Optimize field selection
- [ ] Move dynamic data to ISR or client-side

### Long-term (This Month)
- [ ] Set up GraphQL for complex queries
- [ ] Implement React Query for client-side caching
- [ ] Optimize WordPress queries
- [ ] Add database indexes

---

## Expected Improvements

### After HIGH Priority Items
- API Latency: 50-70% reduction
- Duplicate Requests: 80-90% reduction
- Cache Hit Rate: 0% → 80-90%

### After All Items
- API Latency: 70-90% reduction
- Total Fetch Time: 60-80% reduction
- Server Load: 50-70% reduction

---

## Monitoring

### Track Improvements

```bash
# Before optimization
curl http://localhost:3000/api/performance/report > before.json

# After optimization
curl http://localhost:3000/api/performance/report > after.json

# Compare
diff before.json after.json
```

### Key Metrics to Watch

- Average latency per route
- Duplicate request count
- Cache hit rate
- Error rate
- Fetch count per route

---

## Next Steps

1. Generate initial report
2. Identify top 3 slowest routes
3. Implement HIGH priority fixes
4. Re-test and measure
5. Continue with MEDIUM priority items

