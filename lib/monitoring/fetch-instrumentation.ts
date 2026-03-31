/**
 * Fetch Instrumentation for Performance Monitoring
 * 
 * Wraps fetch calls to track:
 * - Request timing
 * - Endpoint mapping (Next.js route → WP endpoint)
 * - Duplicate request detection
 * - Error tracking
 */

import { getErrorMessage } from '@/lib/utils/errors';

interface FetchMetrics {
  url: string;
  method: string;
  duration: number;
  status?: number;
  route?: string;
  timestamp: number;
  cached?: boolean;
  error?: string;
}

class FetchMonitor {
  private metrics: FetchMetrics[] = [];
  private activeRequests = new Map<string, number>();
  private duplicateDetector = new Map<string, number[]>();
  private maxMetrics = 10000;

  /**
   * Track a fetch call
   */
  track(url: string, method: string, duration: number, status?: number, route?: string, cached?: boolean, error?: string): void {
    const metric: FetchMetrics = {
      url,
      method,
      duration,
      status,
      route,
      timestamp: Date.now(),
      cached,
      error,
    };

    this.metrics.push(metric);

    // Track duplicates
    const key = `${method}:${url}`;
    if (!this.duplicateDetector.has(key)) {
      this.duplicateDetector.set(key, []);
    }
    this.duplicateDetector.get(key)!.push(metric.timestamp);

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get metrics by route
   */
  getMetricsByRoute(route: string, timeWindowMs?: number): FetchMetrics[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    return this.metrics.filter(
      m => m.route === route && m.timestamp > cutoff
    );
  }

  /**
   * Get metrics by WordPress endpoint
   */
  getMetricsByWPEndpoint(wpEndpoint: string, timeWindowMs?: number): FetchMetrics[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    return this.metrics.filter(
      m => m.url.includes(wpEndpoint) && m.timestamp > cutoff
    );
  }

  /**
   * Get duplicate requests
   */
  getDuplicates(threshold: number = 2, timeWindowMs: number = 1000): Array<{ url: string; count: number; avgTime: number }> {
    const cutoff = Date.now() - timeWindowMs;
    const duplicates: Map<string, { count: number; times: number[] }> = new Map();

    for (const [key, timestamps] of this.duplicateDetector.entries()) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length >= threshold) {
        const [method, url] = key.split(':', 2);
        const metrics = this.metrics.filter(
          m => m.url === url && m.method === method && m.timestamp > cutoff
        );
        const times = metrics.map(m => m.duration);
        
        if (times.length > 0) {
          duplicates.set(url, {
            count: recent.length,
            times,
          });
        }
      }
    }

    return Array.from(duplicates.entries()).map(([url, data]) => ({
      url,
      count: data.count,
      avgTime: data.times.reduce((a, b) => a + b, 0) / data.times.length,
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Get route → WP endpoint mapping
   */
  getRouteToWPEndpointMapping(timeWindowMs?: number): Map<string, Map<string, { count: number; avgTime: number }>> {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const mapping = new Map<string, Map<string, { count: number; totalTime: number }>>();

    for (const metric of this.metrics) {
      if (metric.timestamp <= cutoff) continue;
      if (!metric.route) continue;

      const wpEndpoint = this.extractWPEndpoint(metric.url);
      if (!wpEndpoint) continue;

      if (!mapping.has(metric.route)) {
        mapping.set(metric.route, new Map());
      }

      const routeMap = mapping.get(metric.route)!;
      if (!routeMap.has(wpEndpoint)) {
        routeMap.set(wpEndpoint, { count: 0, totalTime: 0 });
      }

      const endpointData = routeMap.get(wpEndpoint)!;
      endpointData.count++;
      endpointData.totalTime += metric.duration;
    }

    // Convert to average times
    const result = new Map<string, Map<string, { count: number; avgTime: number }>>();
    for (const [route, endpoints] of mapping.entries()) {
      const routeMap = new Map<string, { count: number; avgTime: number }>();
      for (const [endpoint, data] of endpoints.entries()) {
        routeMap.set(endpoint, {
          count: data.count,
          avgTime: data.totalTime / data.count,
        });
      }
      result.set(route, routeMap);
    }

    return result;
  }

  /**
   * Extract WordPress endpoint from URL
   */
  private extractWPEndpoint(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // Match WooCommerce API
      const wcMatch = path.match(/\/wp-json\/wc\/v3\/(.+)/);
      if (wcMatch) {
        return `/wc/v3/${wcMatch[1].split('?')[0]}`;
      }

      // Match WordPress REST API
      const wpMatch = path.match(/\/wp-json\/wp\/v2\/(.+)/);
      if (wpMatch) {
        return `/wp/v2/${wpMatch[1].split('?')[0]}`;
      }

      // Match custom endpoints
      const customMatch = path.match(/\/wp-json\/custom\/v1\/(.+)/);
      if (customMatch) {
        return `/custom/v1/${customMatch[1].split('?')[0]}`;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(timeWindowMs?: number): {
    totalRequests: number;
    avgLatency: number;
    slowestRequests: FetchMetrics[];
    errorRate: number;
    routes: string[];
  } {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const recent = this.metrics.filter(m => m.timestamp > cutoff);

    const totalRequests = recent.length;
    const avgLatency = recent.length > 0
      ? recent.reduce((sum, m) => sum + m.duration, 0) / recent.length
      : 0;

    const slowestRequests = [...recent]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const errors = recent.filter(m => m.error || (m.status && m.status >= 400));
    const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0;

    const routes = Array.from(new Set(recent.map(m => m.route).filter((r): r is string => Boolean(r))));

    return {
      totalRequests,
      avgLatency,
      slowestRequests,
      errorRate,
      routes,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.activeRequests.clear();
    this.duplicateDetector.clear();
  }

  /**
   * Export metrics for analysis
   */
  export(): FetchMetrics[] {
    return [...this.metrics];
  }
}

// Singleton instance
export const fetchMonitor = new FetchMonitor();

/**
 * Instrumented fetch wrapper
 */
export async function instrumentedFetch(
  url: string | URL,
  options?: RequestInit,
  route?: string
): Promise<Response> {
  const startTime = Date.now();
  const urlString = typeof url === 'string' ? url : url.toString();
  const method = options?.method || 'GET';
  const requestKey = `${method}:${urlString}`;

  // Check for duplicate (same request within 100ms)
  const recentDuplicates = fetchMonitor.getDuplicates(2, 100);
  const isDuplicate = recentDuplicates.some(d => d.url === urlString);

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    const status = response.status;

    // Track the request
    fetchMonitor.track(
      urlString,
      method,
      duration,
      status,
      route,
      response.headers.get('x-cache') === 'HIT',
      undefined
    );

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      const wpEndpoint = extractWPEndpoint(urlString);
      const logMessage = `[Fetch] ${method} ${wpEndpoint || urlString} - ${duration}ms (${status})${isDuplicate ? ' [DUPLICATE]' : ''}`;
      
      if (duration > 1000) {
        console.warn(`⚠️ ${logMessage}`);
      } else if (duration > 500) {
        console.log(`⚠️ ${logMessage}`);
      } else {
        console.log(logMessage);
      }
    }

    return response;
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);
    
    fetchMonitor.track(
      urlString,
      method,
      duration,
      undefined,
      route,
      false,
      errorMessage || 'Unknown error'
    );

    if (process.env.NODE_ENV === 'development') {
      console.error(`[Fetch Error] ${method} ${urlString} - ${duration}ms - ${errorMessage}`);
    }

    throw error;
  }
}

/**
 * Extract WordPress endpoint from URL (helper)
 */
function extractWPEndpoint(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    const wcMatch = path.match(/\/wp-json\/wc\/v3\/(.+)/);
    if (wcMatch) return `/wc/v3/${wcMatch[1].split('?')[0]}`;

    const wpMatch = path.match(/\/wp-json\/wp\/v2\/(.+)/);
    if (wpMatch) return `/wp/v2/${wpMatch[1].split('?')[0]}`;

    const customMatch = path.match(/\/wp-json\/custom\/v1\/(.+)/);
    if (customMatch) return `/custom/v1/${customMatch[1].split('?')[0]}`;

    return null;
  } catch {
    return null;
  }
}

/**
 * Get current route name (best-effort).
 * Client side: use window.location.
 * Server side: rely on explicit route parameter elsewhere.
 */
export function getCurrentRoute(routeHint?: string): string | undefined {
  if (routeHint) {
    return routeHint;
  }

  if (typeof window !== 'undefined') {
    return window.location.pathname;
  }

  return undefined;
}

