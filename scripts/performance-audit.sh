#!/bin/bash

###############################################################################
# WordPress + WooCommerce REST API Performance Audit Script
#
# This script performs a comprehensive performance audit of WordPress/WooCommerce
# REST API endpoints, identifies bottlenecks, and generates actionable reports.
#
# Usage:
#   ./performance-audit.sh [options]
#
# Options:
#   --api-url URL        WooCommerce API URL
#   --key KEY           WooCommerce Consumer Key
#   --secret SECRET     WooCommerce Consumer Secret
#   --output DIR        Output directory (default: ./audit-results)
#   --iterations N      Number of test iterations (default: 10)
#
###############################################################################

set -euo pipefail

# Default configuration
WC_API_URL="${WC_API_URL:-}"
WC_KEY="${WC_KEY:-}"
WC_SECRET="${WC_SECRET:-}"
OUTPUT_DIR="${OUTPUT_DIR:-./audit-results}"
ITERATIONS="${ITERATIONS:-10}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --api-url)
      WC_API_URL="$2"
      shift 2
      ;;
    --key)
      WC_KEY="$2"
      shift 2
      ;;
    --secret)
      WC_SECRET="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --api-url URL     WooCommerce API URL"
      echo "  --key KEY         Consumer Key"
      echo "  --secret SECRET   Consumer Secret"
      echo "  --output DIR      Output directory"
      echo "  --iterations N    Test iterations"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate configuration
if [[ -z "$WC_API_URL" ]] || [[ -z "$WC_KEY" ]] || [[ -z "$WC_SECRET" ]]; then
  echo -e "${RED}Error: Missing required configuration${NC}"
  echo "Set WC_API_URL, WC_KEY, and WC_SECRET environment variables"
  echo "Or use --api-url, --key, and --secret options"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"
RESULTS_FILE="$OUTPUT_DIR/endpoint-timings-$TIMESTAMP.csv"
REPORT_FILE="$OUTPUT_DIR/PERFORMANCE_AUDIT_REPORT-$TIMESTAMP.md"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}WordPress Performance Audit${NC}"
echo -e "${BLUE}========================================${NC}"
echo "API URL: $WC_API_URL"
echo "Output: $OUTPUT_DIR"
echo "Iterations: $ITERATIONS"
echo ""

# Define endpoints to test
declare -a ENDPOINTS=(
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
  "products?search=test&per_page=24"
  "products?category=1&per_page=24"
)

# Initialize results file
echo "Endpoint,Method,Time(s),Time(ms),Status,Size(bytes),Iteration" > "$RESULTS_FILE"

# Test function
test_endpoint() {
  local endpoint=$1
  local iteration=$2
  local url="$WC_API_URL/$endpoint"
  
  echo -n "  Testing: $endpoint ... "
  
  # Use curl with detailed timing
  local output=$(curl -s -w "\n%{time_total}\n%{http_code}\n%{size_download}" \
    -u "$WC_KEY:$WC_SECRET" \
    "$url" \
    -o /tmp/curl-response-$$.json 2>&1)
  
  local time_total=$(echo "$output" | tail -3 | head -1)
  local http_code=$(echo "$output" | tail -2 | head -1)
  local size=$(echo "$output" | tail -1)
  local time_ms=$(echo "$time_total * 1000" | bc)
  
  # Clean up
  rm -f /tmp/curl-response-$$.json
  
  # Record result
  echo "GET,$endpoint,$time_total,$time_ms,$http_code,$size,$iteration" >> "$RESULTS_FILE"
  
  # Color code output
  if (( $(echo "$time_ms > 1000" | bc -l) )); then
    echo -e "${RED}${time_ms}ms${NC} (HTTP $http_code)"
  elif (( $(echo "$time_ms > 500" | bc -l) )); then
    echo -e "${YELLOW}${time_ms}ms${NC} (HTTP $http_code)"
  else
    echo -e "${GREEN}${time_ms}ms${NC} (HTTP $http_code)"
  fi
}

# Run tests
echo -e "${BLUE}[1/4] Testing REST API Endpoints${NC}"
echo "=========================================="

for i in $(seq 1 $ITERATIONS); do
  echo -e "\n${YELLOW}Iteration $i/$ITERATIONS${NC}"
  for endpoint in "${ENDPOINTS[@]}"; do
    test_endpoint "$endpoint" "$i"
    sleep 0.5  # Small delay between requests
  done
done

# Analyze results
echo -e "\n${BLUE}[2/4] Analyzing Results${NC}"
echo "=========================================="

# Top 15 slowest endpoints (by average)
echo -e "\n${GREEN}Top 15 Slowest Endpoints (Average)${NC}"
TOP_15_FILE="$OUTPUT_DIR/top-15-endpoints-$TIMESTAMP.txt"
{
  echo "# Top 15 Slowest REST API Endpoints"
  echo ""
  echo "| Rank | Endpoint | Avg Latency (ms) | Requests | Status |"
  echo "|------|----------|------------------|----------|--------|"
  
  tail -n +2 "$RESULTS_FILE" | \
    awk -F',' '{
      endpoint = $2
      time_ms = $4
      status = $5
      count[endpoint]++
      sum[endpoint] += time_ms
      status_sum[endpoint] = status
    }
    END {
      n = asorti(sum, sorted)
      for (i = n; i >= 1 && i > n - 15; i--) {
        ep = sorted[i]
        avg = sum[ep] / count[ep]
        printf "| %d | %s | %.2f | %d | %s |\n", 
          n - i + 1, ep, avg, count[ep], status_sum[ep]
      }
    }' | \
    sort -t'|' -k4 -rn | \
    awk -F'|' '{printf "| %d | %s | %.2f | %s | %s |\n", NR, $3, $4, $5, $6}'
} > "$TOP_15_FILE"

cat "$TOP_15_FILE"

# Generate detailed statistics
STATS_FILE="$OUTPUT_DIR/endpoint-stats-$TIMESTAMP.txt"
echo -e "\n${GREEN}Generating Detailed Statistics${NC}"
{
  echo "# Endpoint Performance Statistics"
  echo ""
  tail -n +2 "$RESULTS_FILE" | \
    awk -F',' '{
      endpoint = $2
      time_ms = $4
      count[endpoint]++
      sum[endpoint] += time_ms
      sum_sq[endpoint] += time_ms * time_ms
      if (min[endpoint] == "" || time_ms < min[endpoint]) min[endpoint] = time_ms
      if (max[endpoint] == "" || time_ms > max[endpoint]) max[endpoint] = time_ms
    }
    END {
      printf "%-50s %10s %10s %10s %10s %10s\n", 
        "Endpoint", "Avg(ms)", "Min(ms)", "Max(ms)", "StdDev", "Count"
      print "----------------------------------------------------------------------------------------"
      for (ep in sum) {
        avg = sum[ep] / count[ep]
        variance = (sum_sq[ep] / count[ep]) - (avg * avg)
        stddev = sqrt(variance > 0 ? variance : 0)
        printf "%-50s %10.2f %10.2f %10.2f %10.2f %10d\n",
          ep, avg, min[ep], max[ep], stddev, count[ep]
      }
    }' | \
    sort -k2 -rn
} > "$STATS_FILE"

# Generate report
echo -e "\n${BLUE}[3/4] Generating Report${NC}"
echo "=========================================="

cat > "$REPORT_FILE" << EOF
# WordPress + WooCommerce REST API Performance Audit Report

**Generated:** $(date)
**API URL:** $WC_API_URL
**Test Iterations:** $ITERATIONS

## Executive Summary

This report identifies the slowest REST API endpoints, provides analysis, and recommends optimizations.

## 1. Top 15 Slowest REST Endpoints

$(cat "$TOP_15_FILE")

## 2. Detailed Statistics

\`\`\`
$(head -20 "$STATS_FILE")
\`\`\`

## 3. Recommendations

### High Priority (>1000ms average)
- Implement caching
- Optimize database queries
- Add database indexes
- Reduce payload size with \`_fields\` parameter

### Medium Priority (500-1000ms average)
- Review plugin hooks
- Optimize API responses
- Consider GraphQL for complex queries

### Low Priority (<500ms average)
- Monitor for degradation
- Apply general optimizations

## 4. Next Steps

1. Review slow endpoints
2. Check database slow query log
3. Review WordPress hooks (Query Monitor)
4. Implement recommended optimizations
5. Re-run audit to measure improvements

## 5. Raw Data

- Endpoint timings: \`$RESULTS_FILE\`
- Statistics: \`$STATS_FILE\`
- Top 15: \`$TOP_15_FILE\`

EOF

echo -e "${GREEN}Report generated: $REPORT_FILE${NC}"

# Summary
echo -e "\n${BLUE}[4/4] Summary${NC}"
echo "=========================================="
echo -e "${GREEN}✓${NC} Tested ${#ENDPOINTS[@]} endpoints"
echo -e "${GREEN}✓${NC} Completed $ITERATIONS iterations"
echo -e "${GREEN}✓${NC} Generated performance report"
echo -e "${GREEN}✓${NC} Results saved to: $OUTPUT_DIR"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Review the report: $REPORT_FILE"
echo "2. Check top 15 slowest endpoints"
echo "3. Implement recommended optimizations"
echo "4. Re-run audit to measure improvements"

echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Audit Complete!${NC}"
echo -e "${BLUE}========================================${NC}"

