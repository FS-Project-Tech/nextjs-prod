# 🚀 Next.js Performance Audit - Quick Start

## Setup (5 minutes)

### 1. Instrumentation is Already Enabled

The WooCommerce API client (`lib/woocommerce.ts`) automatically tracks all requests via interceptors. No code changes needed!

### 2. Start Your Dev Server

```bash
npm run dev
```

### 3. Use Your Application

Browse pages, make API calls, use the app normally. Metrics are collected automatically.

### 4. Generate Report

```bash
# Quick report (JSON)
curl http://localhost:3000/api/performance/report

# Markdown report (readable)
curl http://localhost:3000/api/performance/report?format=markdown

# Or use the script
chmod +x scripts/generate-performance-report.sh
./scripts/generate-performance-report.sh
```

---

## 📊 What You Get

### 1. Next.js Routes with SSR/Edge Times

```bash
curl http://localhost:3000/api/performance/metrics?type=routes | jq '.routes'
```

**Output:**
```json
{
  "/api/products": {
    "avgDuration": 245.32,
    "requestCount": 150,
    "avgFetchCount": 2.5,
    "avgFetchTime": 180.45,
    "errorRate": 0.02
  }
}
```

### 2. Route → WordPress Endpoint Mapping

```bash
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.routeToWPEndpoint'
```

**Output:**
```json
{
  "/api/products": {
    "/wc/v3/products": {
      "count": 150,
      "avgTime": 180.45
    }
  }
}
```

### 3. Duplicate Requests

```bash
curl http://localhost:3000/api/performance/metrics?type=fetch | jq '.duplicates'
```

**Output:**
```json
[
  {
    "url": "https://store.com/wp-json/wc/v3/products?per_page=24",
    "count": 5,
    "avgTime": 245.32
  }
]
```

---

## 🔍 Minimal Code Snippet

If you want to manually instrument specific fetch calls:

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

## 🎯 Node.js DevTools

### Enable Inspector

```bash
# Start with inspector
NODE_OPTIONS='--inspect' npm run dev

# Or custom port
NODE_OPTIONS='--inspect=9229' npm run dev
```

### Connect Chrome DevTools

1. Open Chrome
2. Go to `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Use Performance tab to record

### Console Commands

```javascript
// In Node.js console
const { fetchMonitor } = require('./lib/monitoring/fetch-instrumentation');

// Get summary
fetchMonitor.getSummary()

// Get duplicates
fetchMonitor.getDuplicates(2, 5000)

// Get route mapping
fetchMonitor.getRouteToWPEndpointMapping()
```

---

## 📋 Example Output

### Performance Report (Markdown)

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

## Route → WordPress Endpoint Mapping

| Next.js Route | WP Endpoint | Calls | Avg Time (ms) |
|---------------|-------------|-------|---------------|
| /api/products | /wc/v3/products | 150 | 180.45 |
| /api/search | /wc/v3/products | 89 | 456.23 |
```

---

## 🎯 Quick Wins

### 1. Enable Caching (Already Implemented)

The caching layer is ready. Just set `REDIS_URL` in `.env`:

```env
REDIS_URL=redis://localhost:6379
```

### 2. Use Request Batching (Already Implemented)

The batching system is ready. It automatically batches duplicate requests.

### 3. Optimize Field Selection (Already Implemented)

Use the optimizer:

```typescript
import { optimizeProductParams } from '@/lib/api-optimizer';

const params = optimizeProductParams({ per_page: 24 }, 'list');
```

---

## 📝 Next Steps

1. **Run the app** - Use it normally for 24-48 hours
2. **Generate report** - Call `/api/performance/report`
3. **Review findings** - Check slow routes and duplicates
4. **Implement fixes** - Use recommendations
5. **Re-test** - Measure improvements

---

## 🔗 Related Documentation

- `docs/NEXTJS_PERFORMANCE_AUDIT.md` - Complete guide
- `docs/PERFORMANCE_AUDIT_RUNBOOK.md` - WordPress audit
- `docs/OPTIMIZATION_ROADMAP.md` - Optimization plan

