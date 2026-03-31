/**
 * Performance Reporter
 * 
 * Generates reports from collected metrics
 */

import { fetchMonitor } from './fetch-instrumentation';
import { routeMonitor } from './route-performance';

export interface PerformanceReport {
  timestamp: string;
  routes: Array<{
    route: string;
    avgDuration: number;
    requestCount: number;
    avgFetchCount: number;
    avgFetchTime: number;
    errorRate: number;
  }>;
  routeToWPEndpoint: Array<{
    route: string;
    wpEndpoint: string;
    count: number;
    avgTime: number;
  }>;
  duplicates: Array<{
    url: string;
    count: number;
    avgTime: number;
  }>;
  slowestRequests: Array<{
    url: string;
    duration: number;
    route?: string;
    status?: number;
  }>;
  summary: {
    totalRequests: number;
    avgLatency: number;
    errorRate: number;
  };
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(timeWindowMs?: number): PerformanceReport {
  // Get route performance
  const routeMetrics = routeMonitor.getAverageTimesByRoute(timeWindowMs);
  const routes = Array.from(routeMetrics.entries()).map(([route, data]) => ({
    route,
    ...data,
  })).sort((a, b) => b.avgDuration - a.avgDuration);

  // Get route → WP endpoint mapping
  const routeToWP = fetchMonitor.getRouteToWPEndpointMapping(timeWindowMs);
  const routeToWPEndpoint: Array<{ route: string; wpEndpoint: string; count: number; avgTime: number }> = [];
  
  for (const [route, endpoints] of routeToWP.entries()) {
    for (const [wpEndpoint, data] of endpoints.entries()) {
      routeToWPEndpoint.push({
        route,
        wpEndpoint,
        count: data.count,
        avgTime: data.avgTime,
      });
    }
  }

  // Get duplicates
  const duplicates = fetchMonitor.getDuplicates(2, timeWindowMs || 5000);

  // Get slowest requests
  const summary = fetchMonitor.getSummary(timeWindowMs);
  const slowestRequests = summary.slowestRequests.map(m => ({
    url: m.url,
    duration: m.duration,
    route: m.route,
    status: m.status,
  }));

  return {
    timestamp: new Date().toISOString(),
    routes,
    routeToWPEndpoint: routeToWPEndpoint.sort((a, b) => b.avgTime - a.avgTime),
    duplicates: duplicates.slice(0, 20),
    slowestRequests: slowestRequests.slice(0, 20),
    summary: {
      totalRequests: summary.totalRequests,
      avgLatency: summary.avgLatency,
      errorRate: summary.errorRate,
    },
  };
}

/**
 * Format report as markdown
 */
export function formatReportAsMarkdown(report: PerformanceReport): string {
  let markdown = `# Next.js Performance Report\n\n`;
  markdown += `**Generated:** ${report.timestamp}\n\n`;

  // Summary
  markdown += `## Summary\n\n`;
  markdown += `- Total Requests: ${report.summary.totalRequests}\n`;
  markdown += `- Average Latency: ${report.summary.avgLatency.toFixed(2)}ms\n`;
  markdown += `- Error Rate: ${(report.summary.errorRate * 100).toFixed(2)}%\n\n`;

  // Routes
  markdown += `## Next.js Routes (SSR/Edge Times)\n\n`;
  markdown += `| Route | Avg Duration (ms) | Requests | Avg Fetch Count | Avg Fetch Time (ms) | Error Rate |\n`;
  markdown += `|-------|-------------------|----------|-----------------|---------------------|------------|\n`;
  
  for (const route of report.routes.slice(0, 30)) {
    markdown += `| ${route.route} | ${route.avgDuration.toFixed(2)} | ${route.requestCount} | ${route.avgFetchCount.toFixed(1)} | ${route.avgFetchTime.toFixed(2)} | ${(route.errorRate * 100).toFixed(1)}% |\n`;
  }
  markdown += `\n`;

  // Route → WP Endpoint Mapping
  markdown += `## Route → WordPress Endpoint Mapping\n\n`;
  markdown += `| Next.js Route | WP Endpoint | Calls | Avg Time (ms) |\n`;
  markdown += `|---------------|-------------|-------|---------------|\n`;
  
  for (const mapping of report.routeToWPEndpoint.slice(0, 50)) {
    markdown += `| ${mapping.route} | ${mapping.wpEndpoint} | ${mapping.count} | ${mapping.avgTime.toFixed(2)} |\n`;
  }
  markdown += `\n`;

  // Duplicates
  if (report.duplicates.length > 0) {
    markdown += `## Duplicate Requests Detected\n\n`;
    markdown += `| URL | Duplicate Count | Avg Time (ms) |\n`;
    markdown += `|-----|-----------------|---------------|\n`;
    
    for (const dup of report.duplicates) {
      markdown += `| ${dup.url} | ${dup.count} | ${dup.avgTime.toFixed(2)} |\n`;
    }
    markdown += `\n`;
  }

  // Slowest Requests
  markdown += `## Slowest Requests\n\n`;
  markdown += `| URL | Duration (ms) | Route | Status |\n`;
  markdown += `|-----|---------------|-------|--------|\n`;
  
  for (const req of report.slowestRequests) {
    markdown += `| ${req.url} | ${req.duration.toFixed(2)} | ${req.route || 'N/A'} | ${req.status || 'N/A'} |\n`;
  }

  return markdown;
}

/**
 * Export report to file
 */
export async function exportReportToFile(report: PerformanceReport, filename?: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const reportDir = path.join(process.cwd(), 'performance-reports');
  await fs.mkdir(reportDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = filename || path.join(reportDir, `performance-report-${timestamp}.json`);
  
  await fs.writeFile(filepath, JSON.stringify(report, null, 2));
  
  // Also generate markdown
  const markdownPath = filepath.replace('.json', '.md');
  const markdown = formatReportAsMarkdown(report);
  await fs.writeFile(markdownPath, markdown);
  
  return filepath;
}

