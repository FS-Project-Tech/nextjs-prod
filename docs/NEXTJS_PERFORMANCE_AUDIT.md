# 🔍 Next.js Performance Audit - WordPress Request Tracking

## Overview

This guide provides instructions to instrument and analyze Next.js → WordPress API requests, identify bottlenecks, and generate performance reports.

---

## 🚀 Quick Start

### 1. Enable Instrumentation

The instrumentation is already set up. To enable it:

```typescript
// In your API routes or server components, use instrumented fetch
import { instrumentedFetch } from '@/lib/monitoring/fetch-instrumentation';
import instrumentedWcAPI from '@/lib/woocommerce-instrumented';

// Instead of: await fetch(url)
// Use: await instrumentedFetch(url, options, routeName)

// Instead of: await wcAPI.get('/products')
// Use: await instrumentedWcAPI.get('/products')
```

### 2. Generate Performance Report

```bash
# Get JSON report
curl http://localhost:3000/api/performance/report

# Get Markdown report
curl http://localhost:3000/api/performance/report?format=markdown

# Get report for last 5 minutes
curl http://localhost:3000/api/performance/report?window=300000

# Export to file
curl http://localhost:3000/api/performance/report?export=true
```

### 3. View Metrics

```bash
# Get all metrics
curl http://localhost:3000/api/performance/metrics

# Get fetch metrics only
curl http://localhost:3000/api/performance/metrics?type=fetch

# Get route metrics only
curl http://localhost:3000/api/performance/metrics?type=routes

# Get metrics for last 10 minutes
curl http://localhost:3000/api/performance/metrics?window=600000
```

---

## 📊 Deliverables

### 1. Next.js Routes with SSR/Edge Times

**Endpoint:** `GET /api/performance/metrics?type=routes`

**Example Response:**
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
    }
  },
  "slowestRoutes": [
    {
      "route": "/api/search",
      "type": "api",
      "duration": 1234.56,
      "fetchCount": 5,
      "fetchTime": 1100.23
    }
  ]
}
```

### 2. Route → WordPress Endpoint Mapping

**Endpoint:** `GET /api/performance/metrics?type=fetch`

**Example Response:**
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
      }
    }
  }
}
```

### 3. Duplicate Requests

**Endpoint:** `GET /api/performance/metrics?type=fetch`

**Example Response:**
```json
{
  "duplicates": [
    {
      "url": "https://store.com/wp-json/wc/v3/products?per_page=24",
      "count": 5,
      "avgTime": 245.32
    }
  ]
}
```

---

## 🔧 Implementation

### Step 1: Update API Routes

Replace `wcAPI` with `instrumentedWcAPI`:

```typescript
// Before
import wcAPI from '@/lib/woocommerce';

// After
import instrumentedWcAPI from '@/lib/woocommerce-instrumented';

// Usage stays the same
const response = await instrumentedWcAPI.get('/products', { params });
```

### Step 2: Update Server Components

Wrap fetch calls with instrumentation:

```typescript
// Before
const response = await fetch(`${wpBase}/wp-json/wp/v2/media`);

// After
import { instrumentedFetch } from '@/lib/monitoring/fetch-instrumentation';
import { headers } from 'next/headers';

const route = headers().get('x-pathname') || 'unknown';
const response = await instrumentedFetch(
  `${wpBase}/wp-json/wp/v2/media`,
  { cache: 'no-store' },
  route
);
```

### Step 3: Add Route Tracking to API Routes

```typescript
import { withRouteTracking } from '@/lib/monitoring/route-performance';

async function handler(req: NextRequest) {
  // Your handler code
}

export const GET = withRouteTracking(handler, '/api/products', 'api');
```

---

## 📈 Node.js DevTools Commands

### Enable Performance Monitoring

```bash
# Start Next.js with Node.js inspector
NODE_OPTIONS='--inspect' npm run dev

# Or with custom port
NODE_OPTIONS='--inspect=9229' npm run dev
```

### Chrome DevTools

1. Open Chrome
2. Navigate to `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Go to "Performance" tab
5. Record performance while using the app

### Analyze Performance

```javascript
// In Node.js console or DevTools
const { fetchMonitor } = require('./lib/monitoring/fetch-instrumentation');
const { routeMonitor } = require('./lib/monitoring/route-performance');

// Get summary
console.log(fetchMonitor.getSummary());

// Get duplicates
console.log(fetchMonitor.getDuplicates(2, 5000));

// Get route mapping
console.log(fetchMonitor.getRouteToWPEndpointMapping());
```

---

## 🧪 Testing & Validation

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
# Run multiple requests
for i in {1..10}; do
  curl http://localhost:3000/api/products?per_page=24 &
done
wait

# Then check metrics
curl http://localhost:3000/api/performance/metrics
```

### Check for Duplicates

```bash
# Get duplicates report
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.duplicates'
```

---

## 📋 Code Snippet: Minimal Fetch Wrapper

```typescript
// lib/fetch-timed.ts
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

const response = await timedFetch('https://api.example.com/data');
```

---

## 🎯 Recommendations

### Based on Report Findings

#### HIGH Priority

**1. Duplicate Requests**
- **Issue**: Same endpoint called multiple times
- **Action**: Implement request deduplication
- **Code**: Already implemented in `lib/api-batcher.ts`

**2. Slow WordPress Endpoints**
- **Issue**: WP endpoint taking >500ms
- **Action**: 
  - Add caching (Redis)
  - Optimize WP queries
  - Use GraphQL for complex queries

**3. Sequential Fetches**
- **Issue**: Multiple fetches in sequence
- **Action**: Use `Promise.all()` for parallel requests
- **Example:**
  ```typescript
  // Before (sequential)
  const products = await fetchProducts();
  const categories = await fetchCategories();
  
  // After (parallel)
  const [products, categories] = await Promise.all([
    fetchProducts(),
    fetchCategories(),
  ]);
  ```

#### MEDIUM Priority

**4. Missing Caching**
- **Issue**: Same data fetched repeatedly
- **Action**: Enable Redis caching
- **Code**: Already implemented in `lib/cache/redis-enhanced.ts`

**5. Large Payloads**
- **Issue**: Fetching unnecessary fields
- **Action**: Use `_fields` parameter
- **Code**: Already implemented in `lib/api-optimizer.ts`

**6. SSR for Dynamic Data**
- **Issue**: SSR fetching on every request
- **Action**: Move to ISR or client-side fetching
- **Example:**
  ```typescript
  // Before (SSR)
  export default async function Page() {
    const data = await fetchData(); // Fetches on every request
    return <div>{data}</div>;
  }
  
  // After (ISR)
  export const revalidate = 300; // Revalidate every 5 minutes
  export default async function Page() {
    const data = await fetchData(); // Cached for 5 minutes
    return <div>{data}</div>;
  }
  ```

#### LOW Priority

**7. Unnecessary Re-fetches**
- **Issue**: Fetching data already available
- **Action**: Use React Query or SWR for client-side caching

**8. Large Bundle Sizes**
- **Issue**: Loading unnecessary code
- **Action**: Use dynamic imports

---

## 📊 Report Interpretation

### Route Performance

- **< 200ms**: Excellent
- **200-500ms**: Good
- **500-1000ms**: Needs optimization
- **> 1000ms**: Critical

### Fetch Count

- **1-2 fetches**: Optimal
- **3-5 fetches**: Acceptable
- **> 5 fetches**: Consider batching

### Duplicate Rate

- **0 duplicates**: Optimal
- **1-2 duplicates**: Acceptable
- **> 2 duplicates**: Implement deduplication

---

## 🔄 Workflow

1. **Enable Instrumentation** (5 minutes)
   - Update imports to use instrumented versions
   - Add route tracking to API routes

2. **Run Application** (24-48 hours)
   - Use application normally
   - Or generate test load

3. **Generate Report** (1 minute)
   - Call `/api/performance/report`
   - Review findings

4. **Implement Fixes** (1-2 weeks)
   - Start with HIGH priority items
   - Re-test after each change

5. **Validate Improvements** (ongoing)
   - Compare before/after metrics
   - Monitor for regressions

---

## 📝 Example Report Output

See `docs/PERFORMANCE_AUDIT_EXAMPLES.md` for sample outputs.

---

## 🛠️ Troubleshooting

### No Metrics Collected

- Check instrumentation is enabled
- Verify routes are being called
- Check console for errors

### Missing Route Names

- Ensure route tracking is added to API routes
- Check `getCurrentRoute()` implementation

### Duplicates Not Detected

- Adjust duplicate detection window
- Check request timing

---

## Next Steps

1. Enable instrumentation in key routes
2. Run application for data collection
3. Generate performance report
4. Review findings
5. Implement optimizations
6. Re-test and measure improvements

