# 🔍 Next.js Performance Audit - Complete Package

## Overview

Complete instrumentation and analysis system for tracking Next.js → WordPress API requests, identifying bottlenecks, and generating actionable reports.

---

## ✅ Deliverables

### 1. Next.js Routes with SSR/Edge Times

**Endpoint:** `GET /api/performance/metrics?type=routes`

**Example Command:**
```bash
curl http://localhost:3000/api/performance/metrics?type=routes | jq '.routes'
```

**Example Output:**
```json
{
  "routes": {
    "/api/products": {
      "avgDuration": 245.32,
      "requestCount": 150,
      "avgFetchCount": 2.5,
      "avgFetchTime": 180.45,
      "errorRate": 0.02
    },
    "/api/search": {
      "avgDuration": 523.67,
      "requestCount": 89,
      "avgFetchCount": 4.2,
      "avgFetchTime": 456.23,
      "errorRate": 0.05
    },
    "/app/products/[slug]/page": {
      "avgDuration": 345.21,
      "requestCount": 45,
      "avgFetchCount": 3.1,
      "avgFetchTime": 298.76,
      "errorRate": 0.01
    }
  },
  "slowestRoutes": [
    {
      "route": "/api/search",
      "type": "api",
      "duration": 1234.56,
      "fetchCount": 5,
      "fetchTime": 1100.23,
      "timestamp": 1705320000000
    }
  ]
}
```

**Interpretation:**
- `avgDuration`: Total route execution time (SSR/Edge)
- `avgFetchCount`: Average number of fetch calls per request
- `avgFetchTime`: Total time spent waiting for fetches
- `errorRate`: Percentage of requests that failed

---

### 2. Route → WordPress Endpoint Mapping

**Endpoint:** `GET /api/performance/metrics?type=fetch`

**Example Command:**
```bash
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.routeToWPEndpoint'
```

**Example Output:**
```json
{
  "routeToWPEndpoint": {
    "/api/products": {
      "/wc/v3/products": {
        "count": 150,
        "avgTime": 180.45
      },
      "/wc/v3/products/categories": {
        "count": 50,
        "avgTime": 120.32
      }
    },
    "/app/products/[slug]/page": {
      "/wc/v3/products/123": {
        "count": 45,
        "avgTime": 234.56
      },
      "/wc/v3/products/categories": {
        "count": 45,
        "avgTime": 98.76
      }
    },
    "/api/search": {
      "/wc/v3/products": {
        "count": 89,
        "avgTime": 456.23
      },
      "/wp/v2/product_cat": {
        "count": 89,
        "avgTime": 123.45
      }
    }
  }
}
```

**Interpretation:**
- Shows which Next.js routes call which WordPress endpoints
- `count`: Number of times endpoint was called
- `avgTime`: Average time spent waiting for that endpoint

**Action Items:**
- Routes with high `avgTime` → Optimize WordPress endpoint
- Routes with high `count` → Consider caching
- Multiple WP endpoints per route → Consider batching

---

### 3. Duplicate Requests

**Endpoint:** `GET /api/performance/metrics?type=fetch`

**Example Command:**
```bash
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.duplicates'
```

**Example Output:**
```json
{
  "duplicates": [
    {
      "url": "https://store.com/wp-json/wc/v3/products?per_page=24",
      "count": 5,
      "avgTime": 245.32
    },
    {
      "url": "https://store.com/wp-json/wc/v3/products/categories",
      "count": 3,
      "avgTime": 120.45
    }
  ]
}
```

**Interpretation:**
- `count`: Number of duplicate requests within time window
- `avgTime`: Average time for these requests
- **Action**: Implement request deduplication or caching

---

## 🔧 Instrumentation Setup

### Automatic (Already Enabled)

The WooCommerce API client (`lib/woocommerce.ts`) **automatically tracks all requests** via axios interceptors. No code changes needed!

### Manual Instrumentation

For custom fetch calls:

```typescript
// Option 1: Use instrumented fetch
import { instrumentedFetch } from '@/lib/monitoring/fetch-instrumentation';
import { headers } from 'next/headers';

const route = headers().get('x-pathname') || 'unknown';
const response = await instrumentedFetch(url, options, route);

// Option 2: Use minimal timed fetch
import { timedFetch } from '@/lib/fetch-timed';

const response = await timedFetch(url, options);
// Logs: fetch <url> took <ms> ms (<status>)
```

---

## 📊 Node.js DevTools Commands

### Enable Inspector

```bash
# Start Next.js with inspector
NODE_OPTIONS='--inspect' npm run dev

# Or custom port
NODE_OPTIONS='--inspect=9229' npm run dev
```

### Chrome DevTools

1. Open Chrome
2. Navigate to `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Go to "Performance" tab
5. Click Record
6. Use your application
7. Stop recording
8. Analyze performance timeline

### Console Commands

```javascript
// In Node.js console (after connecting DevTools)
const { fetchMonitor } = require('./lib/monitoring/fetch-instrumentation');
const { routeMonitor } = require('./lib/monitoring/route-performance');

// Get summary
console.log(fetchMonitor.getSummary());

// Get duplicates
console.log(fetchMonitor.getDuplicates(2, 5000));

// Get route mapping
const mapping = fetchMonitor.getRouteToWPEndpointMapping();
console.log(Array.from(mapping.entries()));

// Get route metrics
const routes = routeMonitor.getAverageTimesByRoute();
console.log(Array.from(routes.entries()));
```

---

## 🧪 Testing Commands

### Test Individual Routes

```bash
# Test products API
time curl http://localhost:3000/api/products?per_page=24

# Test search API
time curl http://localhost:3000/api/search?q=laptop

# Test category page (SSR)
time curl http://localhost:3000/product-category/electronics
```

### Generate Test Load

```bash
# Run 10 concurrent requests
for i in {1..10}; do
  curl http://localhost:3000/api/products?per_page=24 &
done
wait

# Then check for duplicates
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.duplicates'
```

### Full Performance Report

```bash
# Generate complete report
curl http://localhost:3000/api/performance/report?format=markdown > report.md

# Or use script
chmod +x scripts/generate-performance-report.sh
./scripts/generate-performance-report.sh
```

---

## 📋 Minimal Code Snippet

```typescript
// lib/fetch-timed.ts (already created)
export async function timedFetch(
  url: string | URL,
  options?: RequestInit
): Promise<Response> {
  const t0 = Date.now();
  
  try {
    const res = await fetch(url, options);
    const t1 = Date.now();
    
    console.log('fetch', url, 'took', t1 - t0, 'ms', `(${res.status})`);
    
    return res;
  } catch (error: any) {
    const t1 = Date.now();
    console.error('fetch', url, 'failed after', t1 - t0, 'ms:', error.message);
    throw error;
  }
}
```

**Usage:**
```typescript
import { timedFetch } from '@/lib/fetch-timed';

// Replace fetch with timedFetch
const response = await timedFetch('https://api.example.com/data');
```

---

## 🎯 Recommendations

### Based on Report Findings

#### HIGH Priority

**1. Duplicate Requests**
- **Detection**: Check `duplicates` array in metrics
- **Action**: Enable request batching (already implemented)
- **Code**: `lib/api-batcher.ts` - automatic deduplication

**2. Sequential Fetches**
- **Detection**: `avgFetchCount` > 3, `avgFetchTime` close to `avgDuration`
- **Action**: Convert to `Promise.all()`
- **Expected**: 50-70% time reduction

**3. Missing Caching**
- **Detection**: Cache hit rate = 0%
- **Action**: Set `REDIS_URL` in `.env`
- **Expected**: 80-90% latency reduction

#### MEDIUM Priority

**4. Large Payloads**
- **Detection**: Check payload sizes in report
- **Action**: Use field selection (`lib/api-optimizer.ts`)
- **Expected**: 50-70% payload reduction

**5. SSR for Dynamic Data**
- **Detection**: Routes with high `requestCount` and no caching
- **Action**: Move to ISR or client-side fetching
- **Expected**: 80-95% reduction for cached pages

**6. Slow WordPress Endpoints**
- **Detection**: WP endpoints with `avgTime` > 500ms
- **Action**: Optimize WordPress, add indexes, use GraphQL
- **Expected**: 50-80% reduction

---

## 📈 Expected Report Format

### Complete Performance Report

```markdown
# Next.js Performance Report

**Generated:** 2024-01-15T14:30:00.000Z

## Summary
- Total Requests: 1250
- Average Latency: 245.32ms
- Error Rate: 2.50%

## Next.js Routes (SSR/Edge Times)

| Route | Avg Duration (ms) | Requests | Avg Fetch Count | Avg Fetch Time (ms) | Error Rate |
|-------|-------------------|----------|-----------------|---------------------|------------|
| /api/search | 523.67 | 89 | 4.2 | 456.23 | 5.0% |
| /api/products | 245.32 | 150 | 2.5 | 180.45 | 2.0% |
| /app/products/[slug]/page | 345.21 | 45 | 3.1 | 298.76 | 1.0% |

## Route → WordPress Endpoint Mapping

| Next.js Route | WP Endpoint | Calls | Avg Time (ms) |
|---------------|-------------|-------|---------------|
| /api/products | /wc/v3/products | 150 | 180.45 |
| /api/search | /wc/v3/products | 89 | 456.23 |
| /app/products/[slug]/page | /wc/v3/products/123 | 45 | 234.56 |

## Duplicate Requests Detected

| URL | Duplicate Count | Avg Time (ms) |
|-----|-----------------|---------------|
| https://store.com/wp-json/wc/v3/products?per_page=24 | 5 | 245.32 |

## Slowest Requests

| URL | Duration (ms) | Route | Status |
|-----|---------------|-------|--------|
| https://store.com/wp-json/wc/v3/products?search=laptop | 1234.56 | /api/search | 200 |
```

---

## 🔄 Workflow

1. **Start Dev Server** (1 minute)
   ```bash
   npm run dev
   ```

2. **Use Application** (24-48 hours or simulate load)
   - Browse pages
   - Make API calls
   - Use normally

3. **Generate Report** (1 minute)
   ```bash
   curl http://localhost:3000/api/performance/report?format=markdown > report.md
   ```

4. **Analyze Findings** (30 minutes)
   - Review top slow routes
   - Check duplicates
   - Identify bottlenecks

5. **Implement Fixes** (1-2 weeks)
   - Start with HIGH priority
   - Re-test after each change

6. **Validate** (ongoing)
   - Compare before/after
   - Monitor improvements

---

## 📝 Files Created

### Monitoring System
- `lib/monitoring/fetch-instrumentation.ts` - Fetch tracking
- `lib/monitoring/route-performance.ts` - Route tracking
- `lib/monitoring/performance-reporter.ts` - Report generation
- `lib/monitoring/metrics.ts` - Metrics collection

### Instrumentation
- `lib/woocommerce-instrumented.ts` - Instrumented WooCommerce client
- `lib/fetch-timed.ts` - Minimal timed fetch wrapper
- `lib/middleware-route-tracker.ts` - Route tracking middleware

### API Routes
- `app/api/performance/report/route.ts` - Generate reports
- `app/api/performance/metrics/route.ts` - Get metrics

### Scripts
- `scripts/generate-performance-report.sh` - Automated report generation

### Documentation
- `docs/NEXTJS_PERFORMANCE_AUDIT.md` - Complete guide
- `docs/NEXTJS_AUDIT_QUICK_START.md` - Quick start
- `docs/NEXTJS_AUDIT_RECOMMENDATIONS.md` - Recommendations
- `docs/NEXTJS_PERFORMANCE_AUDIT_COMPLETE.md` - This file

---

## ✅ Checklist

- [x] Automatic instrumentation enabled (via axios interceptors)
- [x] Performance monitoring system created
- [x] Report generation API routes created
- [x] Documentation complete
- [x] Example commands provided
- [x] Recommendations documented

---

## 🚀 Next Steps

1. **Start your dev server**
   ```bash
   npm run dev
   ```

2. **Use the application** (or simulate load)

3. **Generate report**
   ```bash
   curl http://localhost:3000/api/performance/report?format=markdown
   ```

4. **Review findings** and implement recommendations

5. **Re-test** and measure improvements

---

**All instrumentation is automatic - no code changes needed to start collecting metrics!**

