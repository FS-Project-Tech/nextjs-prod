# 🎯 Performance Audit - Action Items

## Priority Classification

- **HIGH**: Critical performance issues affecting user experience (>1000ms latency, >80% CPU)
- **MEDIUM**: Significant impact, noticeable to users (500-1000ms latency, 60-80% CPU)
- **LOW**: Minor optimizations, nice to have (<500ms latency, <60% CPU)

---

## 1. Top 15 Slowest REST Endpoints

### Expected Findings & Actions

#### HIGH Priority

**1. `/wc/v3/products?per_page=100+`**
- **Issue**: Fetching too many products at once
- **Action**: 
  - Implement pagination (max 24-50 per page)
  - Add `_fields` parameter to reduce payload
  - Enable caching for product lists
- **Expected Improvement**: 60-80% latency reduction

**2. `/wc/v3/products?search=...`**
- **Issue**: Full-text search is expensive
- **Action**:
  - Add search index (Elasticsearch/Algolia)
  - Limit search to title/SKU only
  - Cache popular searches
- **Expected Improvement**: 70-90% latency reduction

**3. `/wc/v3/orders?per_page=100`**
- **Issue**: Orders table can be large
- **Action**:
  - Add database indexes on `post_date`, `post_status`
  - Limit to 20-50 per page
  - Use `_fields` to reduce payload
- **Expected Improvement**: 50-70% latency reduction

#### MEDIUM Priority

**4. `/wc/v3/products/categories`**
- **Issue**: Loading all categories with product counts
- **Action**:
  - Cache categories (TTL: 1 hour)
  - Lazy load product counts
  - Use GraphQL for nested queries
- **Expected Improvement**: 80-90% latency reduction (with cache)

**5. `/wc/v3/products/{id}` (Single Product)**
- **Issue**: Loading full product with variations
- **Action**:
  - Use `_fields` parameter
  - Lazy load variations
  - Cache individual products
- **Expected Improvement**: 40-60% latency reduction

**6. `/wc/v3/customers?per_page=100`**
- **Issue**: Customer queries can be slow
- **Action**:
  - Add indexes on `user_email`, `user_registered`
  - Limit pagination
  - Cache customer lists
- **Expected Improvement**: 50-70% latency reduction

#### LOW Priority

**7-15. Other Endpoints**
- **Action**: Apply general optimizations (caching, field selection, pagination)

---

## 2. Top 10 Slow WordPress Hooks / Plugins

### Expected Findings & Actions

#### HIGH Priority

**1. `woocommerce_rest_prepare_product_object`**
- **Issue**: Plugins modifying product data in REST responses
- **Action**:
  - Audit plugins hooking into this
  - Disable unnecessary modifications
  - Cache modified responses
- **Expected Improvement**: 30-50% latency reduction

**2. `rest_pre_dispatch` / `rest_post_dispatch`**
- **Issue**: Global REST filters adding overhead
- **Action**:
  - Review all plugins using these hooks
  - Remove or optimize slow callbacks
  - Use object caching for repeated operations
- **Expected Improvement**: 20-40% latency reduction

**3. ACF (Advanced Custom Fields) REST API Integration**
- **Issue**: ACF fields added to REST responses
- **Action**:
  - Disable ACF REST API if not needed
  - Or cache ACF field values
  - Use `_fields` to exclude ACF when not needed
- **Expected Improvement**: 30-50% latency reduction

#### MEDIUM Priority

**4. Security/Scanning Plugins (Wordfence, Sucuri)**
- **Issue**: Scanning REST API requests
- **Action**:
  - Whitelist REST API endpoints from scanning
  - Or disable scanning for authenticated API requests
- **Expected Improvement**: 20-30% latency reduction

**5. Caching Plugins (WP Rocket, W3 Total Cache)**
- **Issue**: Cache warmup/preload affecting REST API
- **Action**:
  - Exclude REST API from cache preload
  - Use separate caching strategy for REST API
- **Expected Improvement**: 10-20% latency reduction

**6. Analytics/Tracking Plugins**
- **Issue**: Tracking REST API requests
- **Action**:
  - Exclude REST API from tracking
  - Use server-side tracking instead
- **Expected Improvement**: 10-15% latency reduction

#### LOW Priority

**7-10. Other Plugin Hooks**
- **Action**: Review and optimize or disable unnecessary hooks

---

## 3. Top 10 Slow SQL Queries

### Expected Findings & Actions

#### HIGH Priority

**1. Products Query Without Indexes**
```sql
-- Example slow query
SELECT * FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish' ORDER BY post_date DESC
```
- **Issue**: Missing indexes on `post_type`, `post_status`, `post_date`
- **Action**:
  ```sql
  ALTER TABLE wp_posts ADD INDEX idx_type_status_date (post_type, post_status, post_date);
  ```
- **Expected Improvement**: 80-95% query time reduction

**2. Product Meta Queries**
```sql
-- Example slow query
SELECT * FROM wp_postmeta WHERE post_id IN (1,2,3,...) AND meta_key = '_price'
```
- **Issue**: Missing composite index
- **Action**:
  ```sql
  ALTER TABLE wp_postmeta ADD INDEX idx_post_meta (post_id, meta_key);
  ```
- **Expected Improvement**: 70-90% query time reduction

**3. Order Queries with Multiple Joins**
```sql
-- Example slow query
SELECT * FROM wp_posts p 
JOIN wp_postmeta pm ON p.ID = pm.post_id 
WHERE p.post_type = 'shop_order' AND pm.meta_key = '_customer_user'
```
- **Issue**: Missing indexes, inefficient joins
- **Action**:
  ```sql
  ALTER TABLE wp_postmeta ADD INDEX idx_meta_key_value (meta_key(191), meta_value(191));
  ```
- **Expected Improvement**: 60-80% query time reduction

#### MEDIUM Priority

**4. Category/Term Queries**
- **Issue**: Missing indexes on taxonomy tables
- **Action**:
  ```sql
  ALTER TABLE wp_term_taxonomy ADD INDEX idx_taxonomy (taxonomy);
  ALTER TABLE wp_term_relationships ADD INDEX idx_term_taxonomy_id (term_taxonomy_id);
  ```
- **Expected Improvement**: 50-70% query time reduction

**5. User/Customer Queries**
- **Issue**: Missing indexes on user meta
- **Action**:
  ```sql
  ALTER TABLE wp_usermeta ADD INDEX idx_user_meta (user_id, meta_key(191));
  ```
- **Expected Improvement**: 40-60% query time reduction

**6-10. Other Slow Queries**
- **Action**: Analyze each query and add appropriate indexes

---

## 4. Server Resource Optimization

### HIGH Priority

**1. PHP-FPM Pool Exhaustion**
- **Issue**: All workers busy, requests queued
- **Action**:
  ```ini
  # /etc/php/8.1/fpm/pool.d/www.conf
  pm = dynamic
  pm.max_children = 50  # Increase based on RAM
  pm.start_servers = 10
  pm.min_spare_servers = 5
  pm.max_spare_servers = 15
  pm.max_requests = 500  # Restart workers after N requests
  ```
- **Expected Improvement**: Eliminate request queuing

**2. MySQL Connection Pool**
- **Issue**: Too many MySQL connections
- **Action**:
  ```ini
  # /etc/mysql/mysql.conf.d/mysqld.cnf
  max_connections = 200
  wait_timeout = 300
  interactive_timeout = 300
  ```
- **Expected Improvement**: Better connection management

**3. PHP Memory Limits**
- **Issue**: Out of memory errors
- **Action**:
  ```ini
  # php.ini
  memory_limit = 256M  # Increase if needed
  max_execution_time = 300
  ```
- **Expected Improvement**: Prevent memory-related failures

### MEDIUM Priority

**4. OPcache Configuration**
- **Action**:
  ```ini
  # php.ini
  opcache.enable=1
  opcache.memory_consumption=128
  opcache.interned_strings_buffer=8
  opcache.max_accelerated_files=10000
  opcache.revalidate_freq=2
  ```
- **Expected Improvement**: 20-30% PHP execution time reduction

**5. Redis Object Cache**
- **Action**: Install Redis object cache plugin
- **Expected Improvement**: 50-80% reduction in database queries

### LOW Priority

**6. Nginx Caching**
- **Action**: Configure Nginx to cache static REST responses
- **Expected Improvement**: 10-20% latency reduction for cached responses

---

## 5. Quick Wins Summary

### Immediate Actions (Do First)

1. **Add Database Indexes** (HIGH)
   - Run index creation queries above
   - **Time**: 15-30 minutes
   - **Impact**: 50-90% query time reduction

2. **Enable Redis Object Cache** (HIGH)
   - Install Redis, configure WordPress
   - **Time**: 30-60 minutes
   - **Impact**: 50-80% reduction in DB queries

3. **Optimize PHP-FPM Pool** (HIGH)
   - Adjust pool settings
   - **Time**: 15 minutes
   - **Impact**: Eliminate request queuing

4. **Add `_fields` Parameter** (MEDIUM)
   - Update API calls to request only needed fields
   - **Time**: 2-4 hours
   - **Impact**: 30-50% payload reduction

5. **Implement Response Caching** (MEDIUM)
   - Cache REST API responses
   - **Time**: 2-4 hours
   - **Impact**: 80-90% latency reduction for cached endpoints

### Short-term Actions (Week 1-2)

6. **Audit and Disable Slow Plugin Hooks** (MEDIUM)
   - Review Query Monitor data
   - Disable unnecessary hooks
   - **Time**: 4-8 hours
   - **Impact**: 20-40% latency reduction

7. **Optimize Product Queries** (MEDIUM)
   - Add pagination limits
   - Implement field selection
   - **Time**: 4-6 hours
   - **Impact**: 40-60% latency reduction

8. **Configure OPcache** (MEDIUM)
   - Enable and tune OPcache
   - **Time**: 30 minutes
   - **Impact**: 20-30% PHP execution time reduction

### Long-term Actions (Week 3-4)

9. **Implement GraphQL** (LOW-MEDIUM)
   - Set up WPGraphQL + WooGraphQL
   - Migrate heavy queries
   - **Time**: 1-2 weeks
   - **Impact**: 30-50% latency reduction for complex queries

10. **Add Search Index** (LOW-MEDIUM)
    - Implement Elasticsearch/Algolia
    - **Time**: 1-2 weeks
    - **Impact**: 70-90% search latency reduction

---

## Expected Overall Improvements

After implementing HIGH priority items:
- **API Latency**: 50-70% reduction
- **Database Load**: 60-80% reduction
- **Server CPU**: 30-50% reduction
- **Memory Usage**: 20-40% reduction

After implementing all items:
- **API Latency**: 70-90% reduction
- **Database Load**: 80-95% reduction
- **Server CPU**: 50-70% reduction
- **Memory Usage**: 30-50% reduction

---

## Monitoring & Validation

### After Each Change

1. Run performance audit again
2. Compare before/after metrics
3. Monitor error logs
4. Check server resources

### Success Metrics

- API latency < 200ms (p95)
- Database query time < 100ms (p95)
- CPU usage < 60% average
- Memory usage < 80%
- PHP-FPM workers not maxed out

