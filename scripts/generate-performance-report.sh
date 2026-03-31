#!/bin/bash

###############################################################################
# Generate Next.js Performance Report
#
# Fetches performance metrics and generates a report
###############################################################################

API_URL="${API_URL:-http://localhost:3000}"
OUTPUT_DIR="${OUTPUT_DIR:-./performance-reports}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "Generating Next.js Performance Report..."
echo "API URL: $API_URL"
echo ""

# Generate report
echo "[1/3] Fetching performance report..."
curl -s "$API_URL/api/performance/report?format=markdown" > "$OUTPUT_DIR/performance-report-$TIMESTAMP.md"
curl -s "$API_URL/api/performance/report" > "$OUTPUT_DIR/performance-report-$TIMESTAMP.json"

# Get metrics
echo "[2/3] Fetching detailed metrics..."
curl -s "$API_URL/api/performance/metrics" > "$OUTPUT_DIR/metrics-$TIMESTAMP.json"

# Get route mapping
echo "[3/3] Generating route mapping..."
curl -s "$API_URL/api/performance/metrics?type=fetch" | jq '.routeToWPEndpoint' > "$OUTPUT_DIR/route-mapping-$TIMESTAMP.json" 2>/dev/null || \
  curl -s "$API_URL/api/performance/metrics?type=fetch" > "$OUTPUT_DIR/route-mapping-$TIMESTAMP.json"

echo ""
echo "Report generated:"
echo "  - Markdown: $OUTPUT_DIR/performance-report-$TIMESTAMP.md"
echo "  - JSON: $OUTPUT_DIR/performance-report-$TIMESTAMP.json"
echo "  - Metrics: $OUTPUT_DIR/metrics-$TIMESTAMP.json"
echo "  - Route Mapping: $OUTPUT_DIR/route-mapping-$TIMESTAMP.json"
echo ""
echo "View report:"
echo "  cat $OUTPUT_DIR/performance-report-$TIMESTAMP.md"

