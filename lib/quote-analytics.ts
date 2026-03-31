/**
 * Quote Analytics Utilities
 * Provides statistics and insights for quote data
 */

import type { Quote } from './types/quote';

export interface QuoteStatistics {
  total: number;
  byStatus: Record<string, number>;
  byMonth: Record<string, number>;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
  averageResponseTime: number; // in days
  topItems: Array<{
    name: string;
    sku?: string;
    count: number;
    totalQuantity: number;
  }>;
}

export interface QuoteTrend {
  date: string;
  count: number;
  totalValue: number;
  accepted: number;
  rejected: number;
  converted: number;
}

/**
 * Calculate statistics from quotes
 */
export function calculateQuoteStatistics(quotes: Quote[]): QuoteStatistics {
  const stats: QuoteStatistics = {
    total: quotes.length,
    byStatus: {},
    byMonth: {},
    totalValue: 0,
    averageValue: 0,
    conversionRate: 0,
    averageResponseTime: 0,
    topItems: [],
  };

  if (quotes.length === 0) {
    return stats;
  }

  // Calculate by status
  quotes.forEach(quote => {
    stats.byStatus[quote.status] = (stats.byStatus[quote.status] || 0) + 1;
  });

  // Calculate by month
  quotes.forEach(quote => {
    const date = new Date(quote.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
  });

  // Calculate total and average value
  const totalValue = quotes.reduce((sum, quote) => sum + quote.total, 0);
  stats.totalValue = totalValue;
  stats.averageValue = totalValue / quotes.length;

  // Calculate conversion rate (accepted quotes / total quotes)
  const acceptedCount = stats.byStatus['accepted'] || 0;
  stats.conversionRate = (acceptedCount / quotes.length) * 100;

  // Calculate average response time (time from created to sent)
  const responseTimes: number[] = [];
  quotes.forEach(quote => {
    if (quote.status_history && quote.status_history.length > 1) {
      const createdTime = new Date(quote.created_at).getTime();
      const sentEntry = quote.status_history.find(h => h.status === 'sent');
      if (sentEntry) {
        const sentTime = new Date(sentEntry.changed_at).getTime();
        const days = (sentTime - createdTime) / (1000 * 60 * 60 * 24);
        if (days > 0) {
          responseTimes.push(days);
        }
      }
    }
  });
  if (responseTimes.length > 0) {
    stats.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Calculate top items
  const itemCounts = new Map<string, { name: string; sku?: string; count: number; totalQuantity: number }>();
  
  quotes.forEach(quote => {
    quote.items.forEach(item => {
      const key = item.sku || item.name;
      const existing = itemCounts.get(key) || {
        name: item.name,
        sku: item.sku || undefined,
        count: 0,
        totalQuantity: 0,
      };
      existing.count += 1;
      existing.totalQuantity += item.qty;
      itemCounts.set(key, existing);
    });
  });

  stats.topItems = Array.from(itemCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}

/**
 * Generate trend data for quotes
 */
export function generateQuoteTrends(
  quotes: Quote[],
  startDate?: Date,
  endDate?: Date
): QuoteTrend[] {
  const trends: Map<string, QuoteTrend> = new Map();

  const filteredQuotes = quotes.filter(quote => {
    const quoteDate = new Date(quote.created_at);
    if (startDate && quoteDate < startDate) return false;
    if (endDate && quoteDate > endDate) return false;
    return true;
  });

  filteredQuotes.forEach(quote => {
    const date = new Date(quote.created_at);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!trends.has(dateKey)) {
      trends.set(dateKey, {
        date: dateKey,
        count: 0,
        totalValue: 0,
        accepted: 0,
        rejected: 0,
        converted: 0,
      });
    }

    const trend = trends.get(dateKey)!;
    trend.count += 1;
    trend.totalValue += quote.total;

    if (quote.status === 'accepted') {
      trend.accepted += 1;
    } else if (quote.status === 'rejected') {
      trend.rejected += 1;
    }

    // Check if quote was converted to order
    if (quote.status === 'accepted' && quote.status_history) {
      const converted = quote.status_history.some(h => 
        h.notes?.toLowerCase().includes('converted') || 
        h.notes?.toLowerCase().includes('order')
      );
      if (converted) {
        trend.converted += 1;
      }
    }
  });

  return Array.from(trends.values())
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get quote statistics by date range
 */
export function getQuoteStatsByDateRange(
  quotes: Quote[],
  startDate: Date,
  endDate: Date
): QuoteStatistics {
  const filteredQuotes = quotes.filter(quote => {
    const quoteDate = new Date(quote.created_at);
    return quoteDate >= startDate && quoteDate <= endDate;
  });

  return calculateQuoteStatistics(filteredQuotes);
}

/**
 * Get status distribution percentages
 */
export function getStatusDistribution(quotes: Quote[]): Array<{
  status: string;
  count: number;
  percentage: number;
  color: string;
}> {
  const stats = calculateQuoteStatistics(quotes);
  const total = stats.total;

  const statusColors: Record<string, string> = {
    pending: '#fbbf24', // yellow
    sent: '#3b82f6', // blue
    accepted: '#10b981', // green
    rejected: '#ef4444', // red
    expired: '#6b7280', // gray
  };

  return Object.entries(stats.byStatus)
    .map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: statusColors[status] || '#6b7280',
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get monthly revenue from quotes
 */
export function getMonthlyRevenue(quotes: Quote[]): Array<{
  month: string;
  revenue: number;
  count: number;
}> {
  const monthlyData: Map<string, { revenue: number; count: number }> = new Map();

  quotes.forEach(quote => {
    const date = new Date(quote.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { revenue: 0, count: 0 });
    }

    const data = monthlyData.get(monthKey)!;
    data.revenue += quote.total;
    data.count += 1;
  });

  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      revenue: data.revenue,
      count: data.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

