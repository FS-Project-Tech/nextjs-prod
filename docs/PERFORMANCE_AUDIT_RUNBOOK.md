# 🔍 WordPress + WooCommerce REST API Performance Audit Runbook

## Overview

This runbook provides exact commands to audit WordPress/WooCommerce REST API performance, identify bottlenecks, and generate actionable recommendations.

**Prerequisites:**
- SSH access to WordPress server
- WP-CLI installed
- MySQL access (read-only sufficient)
- Root/sudo access for system monitoring

---

## Phase 1: Setup & Installation

### 1.1 Install Query Monitor Plugin

```bash
# Via WP-CLI (recommended)
wp plugin install query-monitor --activate --allow-root

# Or via WordPress Admin:
# Plugins > Add New > Search "Query Monitor" > Install > Activate
```

### 1.2 Install WP-CLI REST API Performance Plugin (Custom)

```bash
# Create custom plugin for REST API profiling
cat > /var/www/html/wp-content/plugins/rest-api-profiler.php << 'EOF'
<?php
/**
 * Plugin Name: REST API Profiler
 * Description: Logs REST API endpoint performance
 * Version: 1.0
 */

add_filter('rest_pre_dispatch', function($result, $server, $request) {
    global $rest_api_start_time;
    $rest_api_start_time = microtime(true);
    return $result;
}, 10, 3);

add_filter('rest_post_dispatch', function($response, $server, $request) {
    global $rest_api_start_time;
    if (isset($rest_api_start_time)) {
        $duration = (microtime(true) - $rest_api_start_time) * 1000; // Convert to ms
        $route = $request->get_route();
        $method = $request->get_method();
        
        // Log to file
        $log_file = WP_CONTENT_DIR . '/rest-api-performance.log';
        $log_entry = sprintf(
            "[%s] %s %s - %.2f ms\n",
            date('Y-m-d H:i:s'),
            $method,
            $route,
            $duration
        );
        file_put_contents($log_file, $log_entry, FILE_APPEND);
    }
    return $response;
}, 10, 3);
EOF

wp plugin activate rest-api-profiler --allow-root
```

### 1.3 Enable MySQL Slow Query Log

```bash
# Check current slow query log status
mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query_log%';"
mysql -u root -p -e "SHOW VARIABLES LIKE 'long_query_time';"

# Enable slow query log (if not enabled)
mysql -u root -p << EOF
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5; -- Log queries taking > 0.5 seconds
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow-query.log';
EOF

# Verify
mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query_log%';"
```

### 1.4 Set Up Log Directory

```bash
# Create log directory
sudo mkdir -p /var/log/wordpress-performance
sudo chown www-data:www-data /var/log/wordpress-performance
sudo chmod 755 /var/log/wordpress-performance

# Ensure WordPress can write to log file
sudo touch /var/www/html/wp-content/rest-api-performance.log
sudo chown www-data:www-data /var/www/html/wp-content/rest-api-performance.log
sudo chmod 644 /var/www/html/wp-content/rest-api-performance.log
```

---

## Phase 2: Data Collection

### 2.1 Generate REST API Performance Log

**Run this for 24-48 hours to collect real traffic data, or simulate load:**

```bash
# Get your WooCommerce API credentials
WC_API_URL="https://yourstore.com/wp-json/wc/v3"
WC_KEY="ck_your_key"
WC_SECRET="cs_your_secret"

# Test all major endpoints (run multiple times to get averages)
for i in {1..10}; do
  echo "=== Test Run $i ==="
  
  # Products endpoints
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/products?per_page=24" -o /dev/null
  
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/products?per_page=100" -o /dev/null
  
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/products/categories" -o /dev/null
  
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/products/attributes" -o /dev/null
  
  # Orders endpoints
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/orders?per_page=10" -o /dev/null
  
  # Customers endpoints
  curl -s -w "\nTime: %{time_total}s\n" -u "$WC_KEY:$WC_SECRET" \
    "$WC_API_URL/customers?per_page=10" -o /dev/null
  
  sleep 2
done
```

### 2.2 Analyze REST API Performance Log

```bash
# Analyze the performance log
LOG_FILE="/var/www/html/wp-content/rest-api-performance.log"

# Top 15 slowest endpoints
echo "=== TOP 15 SLOWEST ENDPOINTS ==="
grep -E "GET|POST|PUT|DELETE" "$LOG_FILE" | \
  awk '{print $NF, $0}' | \
  sort -rn | \
  head -15 | \
  awk '{print $1 "ms - " substr($0, index($0,$2))}'

# Average latency by endpoint
echo -e "\n=== AVERAGE LATENCY BY ENDPOINT ==="
grep -E "GET|POST|PUT|DELETE" "$LOG_FILE" | \
  awk '{
    route = $3
    for(i=4; i<NF; i++) route = route " " $i
    time = $NF
    gsub(/ms/, "", time)
    count[route]++
    sum[route] += time
  }
  END {
    for (route in sum) {
      avg = sum[route] / count[route]
      printf "%.2f ms (avg) - %d requests - %s\n", avg, count[route], route
    }
  }' | \
  sort -rn | \
  head -15
```

### 2.3 Query Monitor Data Collection

```bash
# Access Query Monitor via browser:
# 1. Visit any WordPress page while logged in as admin
# 2. Click Query Monitor panel at bottom
# 3. Export data or take screenshots

# Or extract via WP-CLI (if Query Monitor stores data)
wp db query "SELECT * FROM wp_options WHERE option_name LIKE '%qm%' LIMIT 100" --allow-root
```

### 2.4 MySQL Slow Query Analysis

```bash
# Analyze slow query log
SLOW_LOG="/var/log/mysql/slow-query.log"

# Top 10 slowest queries
echo "=== TOP 10 SLOWEST QUERIES ==="
mysqldumpslow -s t -t 10 "$SLOW_LOG"

# Queries by execution count
echo -e "\n=== QUERIES BY EXECUTION COUNT ==="
mysqldumpslow -s c -t 10 "$SLOW_LOG"

# Queries by average time
echo -e "\n=== QUERIES BY AVERAGE TIME ==="
mysqldumpslow -s at -t 10 "$SLOW_LOG"

# If mysqldumpslow not available, use pt-query-digest
# pt-query-digest "$SLOW_LOG" | head -100
```

### 2.5 WordPress Hook Performance Analysis

```bash
# Create hook profiler
cat > /tmp/hook-profiler.php << 'EOF'
<?php
// Add to wp-config.php or mu-plugins
if (defined('WP_DEBUG') && WP_DEBUG) {
    add_action('all', function($hook) {
        global $wp_filter;
        if (!isset($wp_filter[$hook])) return;
        
        $start = microtime(true);
        $callbacks = $wp_filter[$hook]->callbacks;
        $count = 0;
        foreach ($callbacks as $priority => $handlers) {
            $count += count($handlers);
        }
        $duration = (microtime(true) - $start) * 1000;
        
        if ($duration > 10) { // Log hooks taking > 10ms
            error_log(sprintf(
                "SLOW_HOOK: %s - %.2f ms - %d callbacks",
                $hook,
                $duration,
                $count
            ));
        }
    }, 1);
}
EOF

# Or use Query Monitor's hook data
```

### 2.6 Server Resource Snapshot

```bash
# Create monitoring script
cat > /tmp/server-snapshot.sh << 'EOF'
#!/bin/bash
echo "=== SERVER RESOURCE SNAPSHOT - $(date) ==="
echo ""

echo "=== CPU USAGE ==="
top -bn1 | grep "Cpu(s)" | awk '{print $2 $3 $4 $5 $6 $7 $8}'
echo ""

echo "=== MEMORY USAGE ==="
free -h
echo ""

echo "=== PHP-FPM STATUS ==="
# For systemd
systemctl status php8.1-fpm 2>/dev/null || systemctl status php8.0-fpm 2>/dev/null || systemctl status php-fpm 2>/dev/null
echo ""

echo "=== PHP-FPM PROCESSES ==="
ps aux | grep php-fpm | grep -v grep | wc -l
echo "Active processes:"
ps aux | grep php-fpm | grep -v grep | head -5
echo ""

echo "=== PHP-FPM POOL STATUS (if status page enabled) ==="
curl -s http://localhost/fpm-status 2>/dev/null || echo "FPM status page not enabled"
echo ""

echo "=== MYSQL PROCESSES ==="
mysql -u root -p -e "SHOW PROCESSLIST;" 2>/dev/null | head -20
echo ""

echo "=== DISK I/O ==="
iostat -x 1 2 2>/dev/null || echo "iostat not available"
echo ""

echo "=== NETWORK CONNECTIONS ==="
netstat -an | grep :80 | wc -l
echo "Active HTTP connections"
echo ""

echo "=== NGINX STATUS (if status module enabled) ==="
curl -s http://localhost/nginx_status 2>/dev/null || echo "Nginx status not enabled"
EOF

chmod +x /tmp/server-snapshot.sh
/tmp/server-snapshot.sh > /var/log/wordpress-performance/server-snapshot-$(date +%Y%m%d-%H%M%S).log
```

---

## Phase 3: Automated Audit Script

### 3.1 Complete Audit Script

```bash
cat > /tmp/wordpress-performance-audit.sh << 'EOF'
#!/bin/bash

# Configuration
WC_API_URL="${WC_API_URL:-https://yourstore.com/wp-json/wc/v3}"
WC_KEY="${WC_KEY:-ck_your_key}"
WC_SECRET="${WC_SECRET:-cs_your_secret}"
OUTPUT_DIR="/var/log/wordpress-performance"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "Starting WordPress Performance Audit - $TIMESTAMP"
echo "================================================"

# 1. Test REST API Endpoints
echo -e "\n[1/5] Testing REST API Endpoints..."
ENDPOINTS=(
  "products?per_page=24"
  "products?per_page=100"
  "products/categories"
  "products/attributes"
  "products/tags"
  "orders?per_page=10"
  "orders?status=processing&per_page=10"
  "customers?per_page=10"
  "coupons?per_page=10"
  "shipping/zones"
  "products?search=laptop&per_page=24"
  "products?category=15&per_page=24"
  "products/123"  # Single product
  "products/categories/5"  # Single category
  "orders/123"  # Single order
)

RESULTS_FILE="$OUTPUT_DIR/endpoint-timings-$TIMESTAMP.csv"
echo "Endpoint,Method,Time(s),Status" > "$RESULTS_FILE"

for endpoint in "${ENDPOINTS[@]}"; do
  for i in {1..5}; do
    START=$(date +%s.%N)
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
      -u "$WC_KEY:$WC_SECRET" \
      "$WC_API_URL/$endpoint")
    END=$(date +%s.%N)
    DURATION=$(echo "$END - $START" | bc)
    DURATION_MS=$(echo "$DURATION * 1000" | bc)
    
    echo "GET,$endpoint,$DURATION,$HTTP_CODE" >> "$RESULTS_FILE"
    echo "  $endpoint: ${DURATION_MS}ms (HTTP $HTTP_CODE)"
  done
done

# 2. Analyze Results
echo -e "\n[2/5] Analyzing Results..."
echo "=== TOP 15 SLOWEST ENDPOINTS ===" > "$OUTPUT_DIR/top-15-endpoints-$TIMESTAMP.txt"
tail -n +2 "$RESULTS_FILE" | \
  awk -F',' '{sum[$2]+=$3; count[$2]++} END {for (i in sum) print sum[i]/count[i] "s - " i}' | \
  sort -rn | \
  head -15 >> "$OUTPUT_DIR/top-15-endpoints-$TIMESTAMP.txt"

cat "$OUTPUT_DIR/top-15-endpoints-$TIMESTAMP.txt"

# 3. MySQL Slow Queries
echo -e "\n[3/5] Analyzing MySQL Slow Queries..."
if [ -f /var/log/mysql/slow-query.log ]; then
  mysqldumpslow -s t -t 10 /var/log/mysql/slow-query.log > "$OUTPUT_DIR/top-10-slow-queries-$TIMESTAMP.txt" 2>/dev/null
  echo "Slow queries saved to: $OUTPUT_DIR/top-10-slow-queries-$TIMESTAMP.txt"
else
  echo "Slow query log not found at /var/log/mysql/slow-query.log"
fi

# 4. Server Resources
echo -e "\n[4/5] Capturing Server Resources..."
{
  echo "=== CPU ==="
  top -bn1 | grep "Cpu(s)"
  echo ""
  echo "=== MEMORY ==="
  free -h
  echo ""
  echo "=== PHP-FPM PROCESSES ==="
  ps aux | grep php-fpm | grep -v grep | wc -l
  echo ""
  echo "=== MYSQL PROCESSES ==="
  mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SHOW PROCESSLIST;" 2>/dev/null | wc -l
} > "$OUTPUT_DIR/server-resources-$TIMESTAMP.txt"

# 5. WordPress Hooks (via Query Monitor data)
echo -e "\n[5/5] Checking WordPress Hooks..."
# This requires Query Monitor to be active and data collected
echo "Note: Hook analysis requires Query Monitor plugin and browser access"
echo "Visit any WordPress page and check Query Monitor panel"

echo -e "\n================================================"
echo "Audit Complete!"
echo "Results saved to: $OUTPUT_DIR"
echo "================================================"
EOF

chmod +x /tmp/wordpress-performance-audit.sh
```

---

## Phase 4: Specific Test Commands

### 4.1 Test Individual Endpoints with Detailed Timing

```bash
# Test products endpoint with detailed breakdown
curl -w "\n\n=== TIMING BREAKDOWN ===\n\
Time to connect: %{time_connect}s\n\
Time to start transfer: %{time_starttransfer}s\n\
Time total: %{time_total}s\n\
HTTP Code: %{http_code}\n\
Size: %{size_download} bytes\n" \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24" \
  -o /tmp/products-response.json

# Test with verbose output
curl -v -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24" \
  -o /tmp/products-response.json 2>&1 | tee /tmp/curl-verbose.log
```

### 4.2 Test Custom Endpoints

```bash
# Test custom PHP endpoints (if any)
CUSTOM_ENDPOINTS=(
  "/wp-json/custom/v1/wishlist/add"
  "/wp-json/custom/v1/user-assigned-products"
  "/wp-json/custom/v1/wholesale-pricing"
)

for endpoint in "${CUSTOM_ENDPOINTS[@]}"; do
  echo "Testing: $endpoint"
  time curl -X POST \
    -H "Content-Type: application/json" \
    -u "$WC_KEY:$WC_SECRET" \
    "https://yourstore.com$endpoint" \
    -d '{"test": "data"}' \
    -o /dev/null
done
```

### 4.3 Load Testing

```bash
# Install Apache Bench if not available
sudo apt-get install apache2-utils  # Ubuntu/Debian
# or
sudo yum install httpd-tools  # CentOS/RHEL

# Run load test on products endpoint
ab -n 100 -c 10 \
  -u "$WC_KEY:$WC_SECRET" \
  "$WC_API_URL/products?per_page=24"

# Or use wrk (more modern)
# wrk -t4 -c100 -d30s --timeout 10s \
#   -u "$WC_KEY:$WC_SECRET" \
#   "$WC_API_URL/products?per_page=24"
```

---

## Phase 5: WP-CLI Commands

### 5.1 List All REST Routes

```bash
# Get all registered REST routes
wp rest route list --format=table --allow-root

# Get specific route info
wp rest route get /wc/v3/products --format=json --allow-root
```

### 5.2 Check Active Plugins

```bash
# List active plugins
wp plugin list --status=active --allow-root

# Check plugin hooks
wp eval 'print_r($GLOBALS["wp_filter"]);' --allow-root | grep -i "rest"
```

### 5.3 Database Query Analysis

```bash
# Enable query logging temporarily
wp config set WP_DEBUG true --raw --allow-root
wp config set SAVEQUERIES true --raw --allow-root

# Run a test request, then check queries
wp eval 'global $wpdb; print_r($wpdb->queries);' --allow-root
```

---

## Phase 6: Analysis & Reporting

### 6.1 Generate Report

```bash
cat > /tmp/generate-report.sh << 'EOF'
#!/bin/bash
OUTPUT_DIR="/var/log/wordpress-performance"
REPORT_FILE="$OUTPUT_DIR/PERFORMANCE_AUDIT_REPORT-$(date +%Y%m%d).md"

cat > "$REPORT_FILE" << 'REPORT'
# WordPress + WooCommerce Performance Audit Report

Generated: $(date)

## 1. Top 15 Slowest REST Endpoints

$(cat $OUTPUT_DIR/top-15-endpoints-*.txt | head -15)

## 2. Top 10 Slow MySQL Queries

$(cat $OUTPUT_DIR/top-10-slow-queries-*.txt 2>/dev/null || echo "No slow queries found")

## 3. Server Resources

$(cat $OUTPUT_DIR/server-resources-*.txt | tail -1)

## 4. Recommendations

See action items below.
REPORT

echo "Report generated: $REPORT_FILE"
EOF

chmod +x /tmp/generate-report.sh
```

---

## Phase 7: Interpretation & Action Items

### 7.1 Interpreting Results

**Endpoint Latency:**
- < 200ms: Excellent
- 200-500ms: Good
- 500-1000ms: Needs optimization
- > 1000ms: Critical

**MySQL Queries:**
- Queries > 1s: Critical
- Queries > 0.5s: High priority
- Missing indexes: High priority

**Server Resources:**
- CPU > 80%: High load
- Memory > 90%: Potential issue
- PHP-FPM workers maxed: Increase pool size

### 7.2 Quick Wins Action List

See next section for prioritized action items.

---

## Next Steps

1. Run the audit script: `/tmp/wordpress-performance-audit.sh`
2. Collect data for 24-48 hours
3. Analyze results
4. Implement quick wins
5. Re-test and measure improvements

