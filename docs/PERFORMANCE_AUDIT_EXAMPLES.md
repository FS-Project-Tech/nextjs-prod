# Performance Audit - Example Commands & Outputs

## Quick Start

### 1. Run Automated Audit Script

```bash
# Set environment variables
export WC_API_URL="https://yourstore.com/wp-json/wc/v3"
export WC_KEY="ck_your_consumer_key"
export WC_SECRET="cs_your_consumer_secret"

# Run audit
./scripts/performance-audit.sh --iterations 10
```

### 2. Manual Endpoint Testing

```bash
# Test single endpoint with detailed timing
curl -w "\n\n=== TIMING ===\nTime: %{time_total}s\nHTTP: %{http_code}\nSize: %{size_download} bytes\n" \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24" \
  -o /dev/null
```

**Example Output:**
```
=== TIMING ===
Time: 0.523s
HTTP: 200
Size: 45678 bytes
```

---

## Example Audit Results

### Top 15 Slowest Endpoints (Example)

| Rank | Endpoint | Avg Latency (ms) | Requests | Status |
|------|----------|------------------|----------|--------|
| 1 | products?per_page=100 | 1245.32 | 10 | 200 |
| 2 | products?search=laptop | 987.45 | 10 | 200 |
| 3 | orders?per_page=100 | 856.21 | 10 | 200 |
| 4 | products/categories | 654.32 | 10 | 200 |
| 5 | products?category=15 | 543.21 | 10 | 200 |
| 6 | orders?status=processing | 432.10 | 10 | 200 |
| 7 | products?per_page=24 | 321.45 | 10 | 200 |
| 8 | customers?per_page=10 | 298.76 | 10 | 200 |
| 9 | products/attributes | 287.65 | 10 | 200 |
| 10 | shipping/zones | 234.56 | 10 | 200 |
| 11 | products/tags | 198.43 | 10 | 200 |
| 12 | coupons?per_page=10 | 187.32 | 10 | 200 |
| 13 | orders?per_page=10 | 176.21 | 10 | 200 |
| 14 | products/123 | 165.43 | 10 | 200 |
| 15 | products/categories/5 | 154.32 | 10 | 200 |

---

## Example Slow Query Analysis

### MySQL Slow Query Log Output

```bash
# Run: mysqldumpslow -s t -t 10 /var/log/mysql/slow-query.log
```

**Example Output:**
```
Count: 125  Time=1.234s (154.250s)  Lock=0.000s (0.000s)  Rows=24.0 (3000.0)
  SELECT wp_posts.* FROM wp_posts 
  WHERE wp_posts.post_type = 'product' 
  AND wp_posts.post_status = 'publish' 
  ORDER BY wp_posts.post_date DESC 
  LIMIT 0, 24

Count: 89  Time=0.987s (87.843s)  Lock=0.000s (0.000s)  Rows=100.0 (8900.0)
  SELECT wp_posts.* FROM wp_posts 
  WHERE wp_posts.post_type = 'product' 
  AND wp_posts.post_status = 'publish' 
  ORDER BY wp_posts.post_date DESC 
  LIMIT 0, 100
```

**Analysis:**
- Missing index on `(post_type, post_status, post_date)`
- Query takes 1.2s average
- Executed 125 times = 154 seconds total

---

## Example Server Resource Snapshot

```bash
# Run: /tmp/server-snapshot.sh
```

**Example Output:**
```
=== SERVER RESOURCE SNAPSHOT - 2024-01-15 14:30:00 ===

=== CPU USAGE ===
Cpu(s): 45.2%us, 12.3%sy,  0.0%ni, 42.1%id,  0.4%wa

=== MEMORY USAGE ===
              total        used        free      shared  buff/cache   available
Mem:           16Gi       8.2Gi       2.1Gi       512Mi       5.7Gi       7.3Gi
Swap:         2.0Gi       0.0Gi       2.0Gi

=== PHP-FPM PROCESSES ===
15
Active processes:
www-data  1234  2.5  1.2  245678  45678  ?  S    14:30   0:05 php-fpm: pool www
www-data  1235  2.1  1.0  234567  34567  ?  S    14:30   0:04 php-fpm: pool www

=== MYSQL PROCESSES ===
8 active connections

=== DISK I/O ===
Device:    rrqm/s   wrqm/s     r/s     w/s    rMB/s    wMB/s
sda          0.00     0.00   12.50    5.20     0.15     0.03
```

**Analysis:**
- CPU: 45% user, 42% idle - **GOOD**
- Memory: 8.2GB used / 16GB - **GOOD** (51%)
- PHP-FPM: 15 processes - **OK** (check if maxed)
- MySQL: 8 connections - **GOOD**

---

## Example WordPress Hook Analysis

### Query Monitor Output (Manual)

**Top 10 Slow Hooks:**

1. `woocommerce_rest_prepare_product_object` - 45.2ms avg
   - Plugin: WooCommerce
   - Callbacks: 3
   - Action: Review and optimize

2. `rest_pre_dispatch` - 32.1ms avg
   - Plugin: Security Plugin
   - Callbacks: 2
   - Action: Whitelist REST API

3. `acf/rest_api/rest_prepare_product` - 28.7ms avg
   - Plugin: Advanced Custom Fields
   - Callbacks: 1
   - Action: Cache ACF fields

---

## Example Action Items

### HIGH Priority

1. **Add Database Indexes**
   ```sql
   ALTER TABLE wp_posts ADD INDEX idx_type_status_date (post_type, post_status, post_date);
   ```
   - **Expected**: 80% reduction in query time
   - **Time**: 15 minutes

2. **Limit Product Pagination**
   - Change `per_page=100` to `per_page=24`
   - **Expected**: 60% reduction in latency
   - **Time**: 1 hour

### MEDIUM Priority

3. **Enable Redis Caching**
   - Install Redis, configure WordPress
   - **Expected**: 80% reduction for cached endpoints
   - **Time**: 1 hour

4. **Add `_fields` Parameter**
   - Request only needed fields
   - **Expected**: 50% payload reduction
   - **Time**: 2-4 hours

---

## Validation Commands

### After Implementing Optimizations

```bash
# Re-run audit
./scripts/performance-audit.sh --iterations 10

# Compare results
diff audit-results/PERFORMANCE_AUDIT_REPORT-before.md \
     audit-results/PERFORMANCE_AUDIT_REPORT-after.md

# Check specific endpoint improvement
curl -w "\nTime: %{time_total}s\n" \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24" \
  -o /dev/null
```

---

## Troubleshooting

### Issue: curl: (6) Could not resolve host

**Solution:**
```bash
# Check DNS
nslookup yourstore.com

# Use IP address if DNS issue
WC_API_URL="https://123.45.67.89/wp-json/wc/v3"
```

### Issue: curl: (401) Unauthorized

**Solution:**
```bash
# Verify credentials
echo -n "$WC_KEY:$WC_SECRET" | base64

# Test with basic auth
curl -u "$WC_KEY:$WC_SECRET" "$WC_API_URL/products?per_page=1"
```

### Issue: Script fails with "command not found: bc"

**Solution:**
```bash
# Install bc
sudo apt-get install bc  # Ubuntu/Debian
sudo yum install bc      # CentOS/RHEL
```

---

## Next Steps

1. Review audit results
2. Implement HIGH priority actions
3. Re-run audit
4. Compare before/after
5. Document improvements

