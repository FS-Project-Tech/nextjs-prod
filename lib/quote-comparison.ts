/**
 * Quote Comparison Utilities
 * Handles comparing multiple quotes side by side
 */

import type { Quote, QuoteItem } from './types/quote';
import { formatPrice } from './format-utils';

export interface ComparisonItem {
  name: string;
  sku?: string;
  quantity: number;
  prices: Map<string, number>; // quoteId -> price
  total: Map<string, number>; // quoteId -> total (price * quantity)
}

export interface QuoteComparison {
  quotes: Quote[];
  items: ComparisonItem[];
  totals: {
    quoteId: string;
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
  }[];
  dates: {
    quoteId: string;
    created: string;
    expires: string | null;
  }[];
  statuses: {
    quoteId: string;
    status: Quote['status'];
  }[];
}

/**
 * Compare multiple quotes
 */
export function compareQuotes(quotes: Quote[]): QuoteComparison {
  if (quotes.length === 0) {
    return {
      quotes: [],
      items: [],
      totals: [],
      dates: [],
      statuses: [],
    };
  }

  // Collect all unique items across all quotes
  const itemMap = new Map<string, ComparisonItem>();

  quotes.forEach(quote => {
    quote.items.forEach(item => {
      const qty = item.qty || 1;
      const price = Number(item.price) || 0;
      const key = `${item.name}-${item.sku || ''}`;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          name: item.name,
          sku: item.sku || undefined,
          quantity: qty,
          prices: new Map(),
          total: new Map(),
        });
      }

      const comparisonItem = itemMap.get(key)!;
      comparisonItem.prices.set(quote.id, price);
      comparisonItem.total.set(quote.id, price * qty);
    });
  });

  // Convert map to array
  const items: ComparisonItem[] = Array.from(itemMap.values());

  // Extract totals for each quote
  const totals = quotes.map(quote => ({
    quoteId: quote.id,
    subtotal: quote.subtotal,
    shipping: quote.shipping,
    discount: quote.discount,
    total: quote.total,
  }));

  // Extract dates for each quote
  const dates = quotes.map(quote => ({
    quoteId: quote.id,
    created: quote.created_at,
    expires: quote.expires_at || null,
  }));

  // Extract statuses for each quote
  const statuses = quotes.map(quote => ({
    quoteId: quote.id,
    status: quote.status,
  }));

  return {
    quotes,
    items,
    totals,
    dates,
    statuses,
  };
}

/**
 * Get price difference between two quotes for an item
 */
export function getPriceDifference(
  item: ComparisonItem,
  quoteId1: string,
  quoteId2: string
): {
  price1: number | null;
  price2: number | null;
  difference: number | null;
  percentage: number | null;
} {
  const price1 = item.prices.get(quoteId1) ?? null;
  const price2 = item.prices.get(quoteId2) ?? null;

  if (price1 === null || price2 === null) {
    return {
      price1,
      price2,
      difference: null,
      percentage: null,
    };
  }

  const difference = price2 - price1;
  const percentage = price1 !== 0 ? (difference / price1) * 100 : null;

  return {
    price1,
    price2,
    difference,
    percentage,
  };
}

/**
 * Get total difference between two quotes
 */
export function getTotalDifference(
  totals1: { total: number },
  totals2: { total: number }
): {
  difference: number;
  percentage: number;
  isBetter: boolean; // true if totals2 is lower (better deal)
} {
  const difference = totals2.total - totals1.total;
  const percentage = totals1.total !== 0 ? (difference / totals1.total) * 100 : 0;
  const isBetter = difference < 0;

  return {
    difference,
    percentage,
    isBetter,
  };
}

/**
 * Find best quote (lowest total)
 */
export function findBestQuote(quotes: Quote[]): Quote | null {
  if (quotes.length === 0) return null;

  return quotes.reduce((best, current) => {
    return current.total < best.total ? current : best;
  });
}

/**
 * Find worst quote (highest total)
 */
export function findWorstQuote(quotes: Quote[]): Quote | null {
  if (quotes.length === 0) return null;

  return quotes.reduce((worst, current) => {
    return current.total > worst.total ? current : worst;
  });
}

