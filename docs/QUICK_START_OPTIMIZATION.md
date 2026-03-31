# 🚀 Quick Start: Performance Optimizations

## Prerequisites

1. **Redis** (optional but recommended)
   ```bash
   # Install Redis on your VPS
   sudo apt-get install redis-server  # Ubuntu/Debian
   # or
   brew install redis  # macOS
   
   # Start Redis
   redis-server
   ```

2. **Environment Variables**
   ```env
   # Add to .env.local
   REDIS_URL=redis://localhost:6379
   ```

## What's Been Implemented

### ✅ Phase 1: Immediate Wins (COMPLETED)

1. **Enhanced Redis Caching** (`lib/cache/redis-enhanced.ts`)
   - Automatic multi-layer caching
   - Smart TTL strategies
   - Cache invalidation by tags

2. **API Payload Optimization** (`lib/api-optimizer.ts`)
   - Field selection utilities
   - Payload size monitoring
   - Response compression

3. **Request Batching** (`lib/api-batcher.ts`)
   - Automatic request batching
   - Request deduplication
   - Queue management

4. **Updated Products API** (`app/api/products/route.ts`)
   - Integrated caching
   - Field selection
   - Payload monitoring

### ✅ Phase 2: GraphQL Foundation (READY)

1. **GraphQL Client** (`lib/graphql/client.ts`)
2. **Common Queries** (`lib/graphql/queries.ts`)

**To Enable GraphQL**:
1. Install WPGraphQL plugin on WordPress
2. Install WooGraphQL plugin
3. Set `NEXT_PUBLIC_GRAPHQL_URL` in `.env`

### ✅ Monitoring (READY)

1. **Metrics Collection** (`lib/monitoring/metrics.ts`)
   - API response times
   - Cache hit rates
   - Error tracking

## Usage Examples

### Using Enhanced Caching

```typescript
import { cacheGet, cacheSet } from '@/lib/cache/redis-enhanced';

// In your API route
const cached = await cacheGet('products', cacheKey, params);
if (cached) return NextResponse.json(cached);

// After fetching
await cacheSet('products', cacheKey, data, params, ['products']);
```

### Using API Optimizer

```typescript
import { optimizeProductParams } from '@/lib/api-optimizer';

// Optimize parameters with field selection
const optimized = optimizeProductParams(params, 'list');
const response = await wcAPI.get('/products', { params: optimized });
```

### Using Request Batching

```typescript
import { requestBatcher } from '@/lib/api-batcher';

// Automatic batching
const result = await requestBatcher.batch('key', () => fetchData());
```

### Using GraphQL (when enabled)

```typescript
import { getProductsGraphQL } from '@/lib/graphql/queries';

const data = await getProductsGraphQL({
  first: 24,
  category: 'electronics',
});
```

## Performance Monitoring

### Check Cache Stats

```typescript
import { getCacheStats } from '@/lib/cache/redis-enhanced';

const stats = await getCacheStats();
console.log('Memory cache:', stats.memory.keys);
console.log('Redis connected:', stats.redis.connected);
```

### Check Metrics

```typescript
import { metricsCollector } from '@/lib/monitoring/metrics';

const summary = metricsCollector.getSummary(60000); // Last 60 seconds
console.log('Cache hit rate:', summary.cache.hitRate);
console.log('Avg API time:', summary.api.avgResponseTime);
```

## Testing

### Test Caching
1. Make a request to `/api/products`
2. Check response time (should be slow first time)
3. Make same request again
4. Check response time (should be <10ms if cached)

### Test Payload Size
1. Open browser DevTools → Network tab
2. Check response sizes
3. Should see 50-70% reduction with field selection

### Test Batching
1. Make multiple simultaneous requests
2. Check server logs
3. Should see fewer actual API calls

## Next Steps

1. **Test in Development**
   - Verify Redis connection
   - Test caching behavior
   - Monitor metrics

2. **Enable GraphQL** (optional)
   - Install WordPress plugins
   - Configure GraphQL URL
   - Test GraphQL queries

3. **Production Deployment**
   - Set up Redis on production
   - Configure environment variables
   - Monitor performance

4. **Optimize Further**
   - Review cache hit rates
   - Adjust TTL values
   - Add more endpoints to caching

## Troubleshooting

### Redis Not Connecting
- Check `REDIS_URL` is correct
- Verify Redis is running: `redis-cli ping`
- System will fallback to in-memory cache

### Cache Not Working
- Check Redis connection
- Verify cache keys are consistent
- Check TTL values

### GraphQL Errors
- Verify plugins are installed
- Check GraphQL URL is correct
- System will fallback to REST API

## Support

For issues or questions:
1. Check `docs/OPTIMIZATION_IMPLEMENTATION.md` for details
2. Review `docs/OPTIMIZATION_ROADMAP.md` for full plan
3. Check server logs for errors
