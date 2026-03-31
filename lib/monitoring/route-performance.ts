/**
 * Route Performance Monitoring
 * 
 * Tracks SSR/Edge execution times for Next.js routes
 */

interface RouteMetrics {
  route: string;
  type: 'page' | 'api' | 'server-action';
  duration: number;
  timestamp: number;
  fetchCount: number;
  fetchTime: number;
  error?: string;
}

class RoutePerformanceMonitor {
  private metrics: RouteMetrics[] = [];
  private maxMetrics = 5000;

  /**
   * Track route execution
   */
  track(
    route: string,
    type: 'page' | 'api' | 'server-action',
    duration: number,
    fetchCount: number = 0,
    fetchTime: number = 0,
    error?: string
  ): void {
    this.metrics.push({
      route,
      type,
      duration,
      timestamp: Date.now(),
      fetchCount,
      fetchTime,
      error,
    });

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get average SSR/Edge times by route
   */
  getAverageTimesByRoute(timeWindowMs?: number): Map<string, {
    avgDuration: number;
    requestCount: number;
    avgFetchCount: number;
    avgFetchTime: number;
    errorRate: number;
  }> {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    const recent = this.metrics.filter(m => m.timestamp > cutoff);

    const routeData = new Map<string, {
      durations: number[];
      fetchCounts: number[];
      fetchTimes: number[];
      errors: number;
      total: number;
    }>();

    for (const metric of recent) {
      if (!routeData.has(metric.route)) {
        routeData.set(metric.route, {
          durations: [],
          fetchCounts: [],
          fetchTimes: [],
          errors: 0,
          total: 0,
        });
      }

      const data = routeData.get(metric.route)!;
      data.durations.push(metric.duration);
      data.fetchCounts.push(metric.fetchCount);
      data.fetchTimes.push(metric.fetchTime);
      if (metric.error) data.errors++;
      data.total++;
    }

    const result = new Map<string, {
      avgDuration: number;
      requestCount: number;
      avgFetchCount: number;
      avgFetchTime: number;
      errorRate: number;
    }>();

    for (const [route, data] of routeData.entries()) {
      result.set(route, {
        avgDuration: data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
        requestCount: data.total,
        avgFetchCount: data.fetchCounts.reduce((a, b) => a + b, 0) / data.fetchCounts.length,
        avgFetchTime: data.fetchTimes.reduce((a, b) => a + b, 0) / data.fetchTimes.length,
        errorRate: data.errors / data.total,
      });
    }

    return result;
  }

  /**
   * Get slowest routes
   */
  getSlowestRoutes(limit: number = 20, timeWindowMs?: number): RouteMetrics[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    return [...this.metrics]
      .filter(m => m.timestamp > cutoff)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Export metrics
   */
  export(): RouteMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
  }
}

export const routeMonitor = new RoutePerformanceMonitor();

/**
 * Wrap route handler to track performance
 */
export function withRouteTracking<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  route: string,
  type: 'page' | 'api' | 'server-action' = 'api'
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let fetchCount = 0;
    let fetchTime = 0;
    let error: string | undefined;

    // Track fetch calls during execution
    const originalFetch = global.fetch;
    global.fetch = async (...fetchArgs: any[]) => {
      const fetchStart = Date.now();
      fetchCount++;
      try {
        const response = await originalFetch(fetchArgs[0] as RequestInfo | URL, fetchArgs[1] as RequestInit | undefined);
        fetchTime += Date.now() - fetchStart;
        return response;
      } catch (err: any) {
        fetchTime += Date.now() - fetchStart;
        throw err;
      }
    };

    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      
      routeMonitor.track(route, type, duration, fetchCount, fetchTime);
      
      return result;
    } catch (err: any) {
      const duration = Date.now() - startTime;
      error = err.message || 'Unknown error';
      
      routeMonitor.track(route, type, duration, fetchCount, fetchTime, error);
      
      throw err;
    } finally {
      // Restore original fetch
      global.fetch = originalFetch;
    }
  }) as T;
}

