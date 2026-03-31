/**
 * GET /api/performance/metrics
 * 
 * Get raw performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchMonitor } from '@/lib/monitoring/fetch-instrumentation';
import { routeMonitor } from '@/lib/monitoring/route-performance';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const timeWindowMs = searchParams.get('window') 
      ? parseInt(searchParams.get('window')!) 
      : undefined;

    const type = searchParams.get('type') || 'all';

    if (type === 'fetch' || type === 'all') {
      const summary = fetchMonitor.getSummary(timeWindowMs);
      const duplicates = fetchMonitor.getDuplicates(2, timeWindowMs || 5000);
      const routeToWP = fetchMonitor.getRouteToWPEndpointMapping(timeWindowMs);

      if (type === 'fetch') {
        return NextResponse.json({
          summary,
          duplicates,
          routeToWPEndpoint: Object.fromEntries(
            Array.from(routeToWP.entries()).map(([route, endpoints]) => [
              route,
              Object.fromEntries(endpoints.entries()),
            ])
          ),
        });
      }
    }

    if (type === 'routes' || type === 'all') {
      const routeMetrics = routeMonitor.getAverageTimesByRoute(timeWindowMs);
      const slowestRoutes = routeMonitor.getSlowestRoutes(20, timeWindowMs);

      if (type === 'routes') {
        return NextResponse.json({
          routes: Object.fromEntries(
            Array.from(routeMetrics.entries()).map(([route, data]) => [route, data])
          ),
          slowestRoutes,
        });
      }
    }

    // Return all metrics
    const summary = fetchMonitor.getSummary(timeWindowMs);
    const duplicates = fetchMonitor.getDuplicates(2, timeWindowMs || 5000);
    const routeToWP = fetchMonitor.getRouteToWPEndpointMapping(timeWindowMs);
    const routeMetrics = routeMonitor.getAverageTimesByRoute(timeWindowMs);
    const slowestRoutes = routeMonitor.getSlowestRoutes(20, timeWindowMs);

    return NextResponse.json({
      fetch: {
        summary,
        duplicates,
        routeToWPEndpoint: Object.fromEntries(
          Array.from(routeToWP.entries()).map(([route, endpoints]) => [
            route,
            Object.fromEntries(endpoints.entries()),
          ])
        ),
      },
      routes: {
        metrics: Object.fromEntries(
          Array.from(routeMetrics.entries()).map(([route, data]) => [route, data])
        ),
        slowestRoutes,
      },
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    return NextResponse.json(
      { error: 'Failed to get metrics', message: (error instanceof Error ? error.message : 'An error occurred') },
      { status: 500 }
    );
  }
}


