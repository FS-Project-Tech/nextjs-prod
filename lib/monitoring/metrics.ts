/**
 * Performance Metrics Collection
 * 
 * Tracks:
 * - API response times
 * - Cache hit rates
 * - Error rates
 * - Payload sizes
 * - Request counts
 */

import { hasAxiosResponse, getAxiosErrorDetails, getErrorName } from '@/lib/utils/errors';

interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: Metric[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics in memory

  /**
   * Record a metric
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Record API response time
   */
  recordApiTime(endpoint: string, duration: number, status?: number): void {
    this.record('api.response_time', duration, {
      endpoint,
      status: status?.toString() || 'unknown',
    });
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(type: string, hit: boolean): void {
    this.record('cache.hit', hit ? 1 : 0, { type });
  }

  /**
   * Record payload size
   */
  recordPayloadSize(endpoint: string, size: number): void {
    this.record('api.payload_size', size, { endpoint });
  }

  /**
   * Record error
   */
  recordError(endpoint: string, errorType: string): void {
    this.record('api.error', 1, { endpoint, error_type: errorType });
  }

  /**
   * Get metrics summary
   */
  getSummary(timeWindowMs: number = 60000): {
    api: {
      avgResponseTime: number;
      totalRequests: number;
      errorRate: number;
    };
    cache: {
      hitRate: number;
      totalRequests: number;
    };
    payload: {
      avgSize: number;
      maxSize: number;
    };
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recent = this.metrics.filter(m => m.timestamp > cutoff);

    const apiTimes = recent.filter(m => m.name === 'api.response_time');
    const cacheHits = recent.filter(m => m.name === 'cache.hit');
    const payloadSizes = recent.filter(m => m.name === 'api.payload_size');
    const errors = recent.filter(m => m.name === 'api.error');

    return {
      api: {
        avgResponseTime: apiTimes.length > 0
          ? apiTimes.reduce((sum, m) => sum + m.value, 0) / apiTimes.length
          : 0,
        totalRequests: apiTimes.length,
        errorRate: apiTimes.length > 0 ? errors.length / apiTimes.length : 0,
      },
      cache: {
        hitRate: cacheHits.length > 0
          ? cacheHits.filter(m => m.value === 1).length / cacheHits.length
          : 0,
        totalRequests: cacheHits.length,
      },
      payload: {
        avgSize: payloadSizes.length > 0
          ? payloadSizes.reduce((sum, m) => sum + m.value, 0) / payloadSizes.length
          : 0,
        maxSize: payloadSizes.length > 0
          ? Math.max(...payloadSizes.map(m => m.value))
          : 0,
      },
    };
  }

  /**
   * Get metrics by name
   */
  getMetrics(name: string, timeWindowMs?: number): Metric[] {
    const cutoff = timeWindowMs ? Date.now() - timeWindowMs : 0;
    return this.metrics.filter(
      m => m.name === name && m.timestamp > cutoff
    );
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Middleware to track API performance
 */
export async function trackApiPerformance<T>(
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  let status = 200;

  try {
    const result = await fn();
    const duration = Date.now() - start;
    metricsCollector.recordApiTime(endpoint, duration, status);
    return result;
  } catch (error: unknown) {
    let status = 500;
    if (hasAxiosResponse(error)) {
      const details = getAxiosErrorDetails(error);
      status = details.status || 500;
    }
    const duration = Date.now() - start;
    metricsCollector.recordApiTime(endpoint, duration, status);
    metricsCollector.recordError(endpoint, getErrorName(error) || 'Unknown');
    throw error;
  }
}

