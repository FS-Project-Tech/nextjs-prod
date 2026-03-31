"use client";

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { formatPrice } from '@/lib/format-utils';
import { compareQuotes, getPriceDifference, getTotalDifference, findBestQuote } from '@/lib/quote-comparison';
import type { Quote } from '@/lib/types/quote';

function QuoteComparisonContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: showError } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        setLoading(true);
        const quoteIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

        if (quoteIds.length === 0) {
          router.push('/dashboard/quotes');
          return;
        }

        // Fetch all quotes
        const quotePromises = quoteIds.map(id =>
          fetch(`/api/dashboard/quotes/${id}`, {
            credentials: 'include',
            cache: 'no-store',
          }).then(res => res.json())
        );

        const results = await Promise.all(quotePromises);
        const fetchedQuotes = results
          .filter(result => result.quote)
          .map(result => result.quote as Quote);

        if (fetchedQuotes.length === 0) {
          showError('No quotes found to compare');
          router.push('/dashboard/quotes');
          return;
        }

        setQuotes(fetchedQuotes);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load quotes';
        showError(errorMessage);
        router.push('/dashboard/quotes');
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
  }, [searchParams, router, showError]);

  const comparison = useMemo(() => {
    if (quotes.length === 0) return null;
    return compareQuotes(quotes);
  }, [quotes]);

  const bestQuote = useMemo(() => {
    if (quotes.length === 0) return null;
    return findBestQuote(quotes);
  }, [quotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading quotes for comparison...</p>
        </div>
      </div>
    );
  }

  if (!comparison || quotes.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/quotes"
          className="text-teal-600 hover:text-teal-700 flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Quotes
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">No quotes found to compare</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: Quote['status']) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/quotes"
            className="text-teal-600 hover:text-teal-700 flex items-center gap-2 mb-2"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Quotes
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Compare Quotes</h1>
          <p className="text-gray-600 mt-1">
            Comparing {quotes.length} quote{quotes.length !== 1 ? 's' : ''}
          </p>
        </div>
        {bestQuote && (
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Best Value</p>
            <Link
              href={`/dashboard/quotes/${bestQuote.id}`}
              className="text-sm font-semibold text-teal-600 hover:text-teal-700"
            >
              {bestQuote.quote_number}
            </Link>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10">
                Item / Details
              </th>
              {quotes.map((quote) => (
                <th
                  key={quote.id}
                  className={`px-4 py-3 text-center text-sm font-semibold text-gray-900 min-w-[200px] ${
                    bestQuote?.id === quote.id ? 'bg-teal-50' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <Link
                      href={`/dashboard/quotes/${quote.id}`}
                      className="text-teal-600 hover:text-teal-700 font-semibold block"
                    >
                      {quote.quote_number}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </span>
                    {bestQuote?.id === quote.id && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                        Best Value
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Dates Row */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                Created Date
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-4 py-3 text-sm text-gray-600 text-center">
                  {new Date(quote.created_at).toLocaleDateString()}
                </td>
              ))}
            </tr>

            {/* Expiry Row */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                Expires
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-4 py-3 text-sm text-gray-600 text-center">
                  {quote.expires_at ? new Date(quote.expires_at).toLocaleDateString() : 'N/A'}
                </td>
              ))}
            </tr>

            {/* Items Section */}
            <tr className="bg-gray-50">
              <td colSpan={quotes.length + 1} className="px-4 py-2 text-sm font-semibold text-gray-900">
                Items
              </td>
            </tr>

            {comparison.items.map((item, itemIndex) => (
              <tr key={itemIndex} className="border-b border-gray-100">
                <td className="px-4 py-3 text-sm sticky left-0 bg-white z-10">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  {item.sku && (
                    <div className="text-xs text-gray-500 mt-0.5">SKU: {item.sku}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">Qty: {item.quantity}</div>
                </td>
                {quotes.map((quote) => {
                  const price = item.prices.get(quote.id);
                  const total = item.total.get(quote.id);
                  const hasItem = price !== undefined;

                  if (!hasItem) {
                    return (
                      <td key={quote.id} className="px-4 py-3 text-sm text-gray-400 text-center">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={quote.id} className="px-4 py-3 text-sm text-center">
                      <div className="space-y-1">
                        <div className="font-medium text-gray-900">
                          {formatPrice(price!)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Total: {formatPrice(total!)}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Totals Section */}
            <tr className="bg-gray-50">
              <td colSpan={quotes.length + 1} className="px-4 py-2 text-sm font-semibold text-gray-900">
                Pricing Summary
              </td>
            </tr>

            {/* Subtotal */}
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                Subtotal
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-4 py-3 text-sm text-gray-900 text-center font-medium">
                  {formatPrice(quote.subtotal)}
                </td>
              ))}
            </tr>

            {/* Shipping */}
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                Shipping
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-4 py-3 text-sm text-gray-900 text-center">
                  {formatPrice(quote.shipping)}
                </td>
              ))}
            </tr>

            {/* Discount */}
            {quotes.some(q => q.discount > 0) && (
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Discount
                </td>
                {quotes.map((quote) => (
                  <td key={quote.id} className="px-4 py-3 text-sm text-emerald-600 text-center">
                    {quote.discount > 0 ? `-${formatPrice(quote.discount)}` : '—'}
                  </td>
                ))}
              </tr>
            )}

            {/* Total */}
            <tr className="bg-teal-50 border-t-2 border-teal-200">
              <td className="px-4 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-teal-50 z-10">
                Total
              </td>
              {quotes.map((quote) => {
                const isBest = bestQuote?.id === quote.id;
                return (
                  <td
                    key={quote.id}
                    className={`px-4 py-3 text-center ${
                      isBest
                        ? 'text-teal-700 font-bold text-lg'
                        : 'text-gray-900 font-semibold'
                    }`}
                  >
                    {formatPrice(quote.total)}
                    {isBest && (
                      <div className="text-xs text-teal-600 mt-1">Best Value</div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Price Differences (if comparing 2 quotes) */}
            {quotes.length === 2 && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={quotes.length + 1} className="px-4 py-2 text-sm font-semibold text-gray-900">
                    Price Comparison
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                    Difference
                  </td>
                  {(() => {
                    const diff = getTotalDifference(
                      { total: quotes[0].total },
                      { total: quotes[1].total }
                    );
                    return (
                      <td colSpan={2} className="px-4 py-3 text-sm text-center">
                        <div className={`font-medium ${
                          diff.isBetter ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {diff.isBetter ? '↓' : '↑'} {formatPrice(Math.abs(diff.difference))}
                          {diff.percentage !== null && (
                            <span className="text-xs ml-1">
                              ({diff.percentage > 0 ? '+' : ''}{diff.percentage.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Quote {quotes[1].quote_number} is {diff.isBetter ? 'cheaper' : 'more expensive'} than Quote {quotes[0].quote_number}
                        </div>
                      </td>
                    );
                  })()}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-4 justify-center">
        {quotes.map((quote) => (
          <Link
            key={quote.id}
            href={`/dashboard/quotes/${quote.id}`}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            View {quote.quote_number}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function QuoteComparisonPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading quotes for comparison...</p>
        </div>
      </div>
    }>
      <QuoteComparisonContent />
    </Suspense>
  );
}

