# 🔍 WordPress + WooCommerce Performance Audit - Complete Package

## Overview

This package provides a comprehensive performance audit solution for WordPress + WooCommerce REST API endpoints. It includes automated scripts, manual procedures, and actionable recommendations.

---

## 📦 Deliverables

### 1. Documentation

- **`PERFORMANCE_AUDIT_RUNBOOK.md`** - Complete step-by-step runbook with all commands
- **`PERFORMANCE_AUDIT_ACTION_ITEMS.md`** - Prioritized action items with severity ratings
- **`PERFORMANCE_AUDIT_EXAMPLES.md`** - Example commands, outputs, and troubleshooting
- **`PERFORMANCE_AUDIT_SUMMARY.md`** - This summary document

### 2. Automated Scripts

- **`scripts/performance-audit.sh`** - Automated audit script that tests endpoints and generates reports

### 3. Manual Procedures

- WP-CLI commands for route analysis
- MySQL slow query log analysis
- Server resource monitoring
- WordPress hook profiling

---

## 🚀 Quick Start

### Option 1: Automated Audit (Recommended)

```bash
# On your WordPress server (Linux/Unix)
cd /path/to/your/project

# Set credentials
export WC_API_URL="https://yourstore.com/wp-json/wc/v3"
export WC_KEY="ck_your_consumer_key"
export WC_SECRET="cs_your_consumer_secret"

# Run audit
chmod +x scripts/performance-audit.sh
./scripts/performance-audit.sh --iterations 10

# Review results
cat audit-results/PERFORMANCE_AUDIT_REPORT-*.md
```

### Option 2: Manual Audit

Follow the step-by-step procedures in `PERFORMANCE_AUDIT_RUNBOOK.md`

---

## 📊 What You'll Get

### 1. Top 15 Slowest REST Endpoints

**Format:**
- Endpoint path
- Average latency (ms)
- Number of requests tested
- HTTP status codes
- Example curl command to reproduce

**Example Output:**
```
Rank | Endpoint                    | Avg Latency (ms) | Requests | Status
-----|-----------------------------|------------------|----------|--------
1    | products?per_page=100       | 1245.32         | 10       | 200
2    | products?search=laptop      | 987.45          | 10       | 200
...
```

### 2. Top 10 Slow WordPress Hooks

**Identified via:**
- Query Monitor plugin data
- Custom hook profiler
- REST API filter analysis

**Includes:**
- Hook name
- Average execution time
- Plugin/theme responsible
- Number of callbacks
- Recommended actions

### 3. Top 10 Slow SQL Queries

**From MySQL slow query log:**
- Query text
- Average execution time
- Execution count
- Lock time
- Recommended indexes

**Example:**
```sql
-- Slow query
SELECT * FROM wp_posts 
WHERE post_type = 'product' 
AND post_status = 'publish' 
ORDER BY post_date DESC 
LIMIT 0, 24

-- Recommended index
ALTER TABLE wp_posts 
ADD INDEX idx_type_status_date (post_type, post_status, post_date);
```

### 4. Server Resource Snapshot

**Commands provided:**
- CPU usage: `top`, `htop`
- Memory: `free -h`
- PHP-FPM: `systemctl status`, process count
- MySQL: `SHOW PROCESSLIST`
- Disk I/O: `iostat`
- Network: `netstat`

**Interpretation guide included**

### 5. Action Items with Severity

**HIGH Priority:**
- Database indexes (15-30 min, 50-90% improvement)
- Redis caching (30-60 min, 50-80% improvement)
- PHP-FPM optimization (15 min, eliminate queuing)

**MEDIUM Priority:**
- Field selection (2-4 hours, 30-50% improvement)
- Response caching (2-4 hours, 80-90% improvement)
- Plugin hook optimization (4-8 hours, 20-40% improvement)

**LOW Priority:**
- General optimizations
- Monitoring improvements

---

## 🔧 Exact Commands Provided

### REST API Testing

```bash
# Test single endpoint
curl -w "\nTime: %{time_total}s\n" \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24" \
  -o /dev/null

# Test all endpoints (automated)
./scripts/performance-audit.sh --iterations 10
```

### WP-CLI Commands

```bash
# List all REST routes
wp rest route list --format=table --allow-root

# Get route details
wp rest route get /wc/v3/products --format=json --allow-root

# List active plugins
wp plugin list --status=active --allow-root
```

### MySQL Analysis

```bash
# Enable slow query log
mysql -u root -p -e "SET GLOBAL slow_query_log = 'ON';"
mysql -u root -p -e "SET GLOBAL long_query_time = 0.5;"

# Analyze slow queries
mysqldumpslow -s t -t 10 /var/log/mysql/slow-query.log
```

### Server Monitoring

```bash
# CPU and Memory
top -bn1 | grep "Cpu(s)"
free -h

# PHP-FPM status
systemctl status php8.1-fpm
ps aux | grep php-fpm | wc -l

# MySQL processes
mysql -u root -p -e "SHOW PROCESSLIST;"
```

---

## 📈 Expected Results

### Before Optimization
- Average API latency: 500-1500ms
- Database queries: 50-200 per request
- CPU usage: 60-90%
- Cache hit rate: 0%

### After Optimization (HIGH priority items)
- Average API latency: 200-500ms (50-70% reduction)
- Database queries: 10-50 per request (60-80% reduction)
- CPU usage: 30-60% (30-50% reduction)
- Cache hit rate: 80-90%

### After All Optimizations
- Average API latency: 100-200ms (70-90% reduction)
- Database queries: 5-20 per request (80-95% reduction)
- CPU usage: 20-40% (50-70% reduction)
- Cache hit rate: 85-95%

---

## 🎯 Success Metrics

### Target Performance
- ✅ API latency < 200ms (p95)
- ✅ Database query time < 100ms (p95)
- ✅ CPU usage < 60% average
- ✅ Memory usage < 80%
- ✅ PHP-FPM workers not maxed
- ✅ Cache hit rate > 80%

---

## 📝 Testing & Validation

### Reproduce Slow Endpoints

**Example curl commands provided for each slow endpoint:**

```bash
# Example: Test slow products endpoint
curl -w "\nTime: %{time_total}s\n" \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=100" \
  -o /dev/null

# Expected: > 1000ms (before optimization)
# Target: < 200ms (after optimization)
```

### Validation After Changes

```bash
# Re-run audit
./scripts/performance-audit.sh --iterations 10

# Compare results
diff audit-results/PERFORMANCE_AUDIT_REPORT-before.md \
     audit-results/PERFORMANCE_AUDIT_REPORT-after.md
```

---

## 🔄 Workflow

1. **Setup** (15 minutes)
   - Install Query Monitor
   - Enable MySQL slow query log
   - Set up log directories

2. **Data Collection** (24-48 hours or simulate)
   - Run audit script
   - Collect real traffic data
   - Monitor server resources

3. **Analysis** (1-2 hours)
   - Review top 15 slow endpoints
   - Analyze slow queries
   - Review WordPress hooks
   - Check server resources

4. **Implementation** (1-2 weeks)
   - Implement HIGH priority items
   - Test changes
   - Implement MEDIUM priority items
   - Monitor improvements

5. **Validation** (ongoing)
   - Re-run audit
   - Compare metrics
   - Document improvements

---

## 📚 Documentation Structure

```
docs/
├── PERFORMANCE_AUDIT_RUNBOOK.md          # Complete runbook
├── PERFORMANCE_AUDIT_ACTION_ITEMS.md     # Prioritized actions
├── PERFORMANCE_AUDIT_EXAMPLES.md         # Examples & outputs
└── PERFORMANCE_AUDIT_SUMMARY.md          # This file

scripts/
└── performance-audit.sh                  # Automated audit script
```

---

## 🛠️ Requirements

### Server Access
- SSH access to WordPress server
- WP-CLI installed
- MySQL access (read-only sufficient)
- Root/sudo for system monitoring

### Tools
- `curl` (for API testing)
- `bc` (for calculations)
- `mysqldumpslow` or `pt-query-digest` (for query analysis)
- `top`, `free`, `iostat` (for system monitoring)

### WordPress
- Query Monitor plugin
- WooCommerce installed
- REST API enabled

---

## 🎓 Next Steps

1. **Review Documentation**
   - Read `PERFORMANCE_AUDIT_RUNBOOK.md` for complete procedures
   - Review `PERFORMANCE_AUDIT_ACTION_ITEMS.md` for priorities

2. **Run Initial Audit**
   - Execute `scripts/performance-audit.sh`
   - Collect baseline metrics

3. **Implement Quick Wins**
   - Start with HIGH priority items
   - Measure improvements

4. **Iterate**
   - Re-run audit after changes
   - Continue optimization cycle

---

## 📞 Support

For issues or questions:
1. Check `PERFORMANCE_AUDIT_EXAMPLES.md` for troubleshooting
2. Review command outputs in runbook
3. Verify server access and permissions
4. Check WordPress/WooCommerce configuration

---

## ✅ Checklist

- [ ] Review all documentation
- [ ] Set up server access
- [ ] Install Query Monitor plugin
- [ ] Enable MySQL slow query log
- [ ] Run initial audit
- [ ] Review top 15 slow endpoints
- [ ] Analyze slow queries
- [ ] Check server resources
- [ ] Implement HIGH priority items
- [ ] Re-run audit
- [ ] Measure improvements
- [ ] Document results

---

**Ready to start? Begin with `PERFORMANCE_AUDIT_RUNBOOK.md`**

