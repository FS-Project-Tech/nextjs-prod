"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { getExpiryStatus, isQuoteExpired } from '@/lib/quote-expiry';
import type { Quote } from '@/lib/types/quote';

// Update the local interface to include missing fields
interface QuoteListItem extends Omit<Quote, 'items'> {
  date?: string;
  items: Array<{
    name: string;
    sku?: string;
    quantity?: number;
    qty?: number;
    price: string | number;
  }>;
}

type StatusFilter = 'all' | 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired';
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'status';

export default function DashboardQuotes() {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const { error: showError, success } = useToast();
  const router = useRouter();

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard/quotes', {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quotes');
        }

        const data = await response.json();
        setQuotes(data.quotes || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load quotes');
        showError(err.message || 'Failed to load quotes');
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
  }, [showError]);

  // Filter and sort quotes
  const filteredAndSortedQuotes = useMemo(() => {
    let filtered = [...quotes];

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(quote => quote.status === statusFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(quote => {
        const quoteNumber = (quote.quote_number || quote.id).toLowerCase();
        return quoteNumber.includes(query);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-desc':
          return new Date(b.created_at || b.date || 0).getTime() - new Date(a.created_at || a.date || 0).getTime();
        case 'date-asc':
          return new Date(a.created_at || a.date || 0).getTime() - new Date(b.created_at || b.date || 0).getTime();
        case 'amount-desc':
          return b.total - a.total;
        case 'amount-asc':
          return a.total - b.total;
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return filtered;
  }, [quotes, statusFilter, sortOption, searchQuery]);

  // Get status counts
  const statusCounts = useMemo(() => {
    const counts = {
      all: quotes.length,
      pending: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
    };
    quotes.forEach(quote => {
      if (quote.status in counts) {
        counts[quote.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [quotes]);

  const handleSelectQuote = (quoteId: string) => {
    setSelectedQuotes(prev => {
      const next = new Set(prev);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedQuotes.size === filteredAndSortedQuotes.length) {
      setSelectedQuotes(new Set());
    } else {
      setSelectedQuotes(new Set(filteredAndSortedQuotes.map(q => q.id)));
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const confirmed = window.confirm('Delete this quote? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/dashboard/quotes/${quoteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete quote');
      }

      success('Quote deleted');
      setQuotes(prev => prev.filter(q => q.id !== quoteId));
      setSelectedQuotes(prev => {
        const next = new Set(prev);
        next.delete(quoteId);
        return next;
      });
    } catch (err: any) {
      showError(err.message || 'Failed to delete quote');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading quotes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading quotes: {error}</p>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
            <p className="text-gray-600 mt-1">View all your quote requests</p>
          </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/quotes/analytics"
            className="text-sm font-medium text-teal-600 hover:text-teal-700 flex items-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Analytics
          </Link>
          <Link
            href="/dashboard/quote-templates"
            className="text-sm font-medium text-teal-600 hover:text-teal-700 flex items-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Templates
          </Link>
        </div>
        </div>

        <div className="text-center py-12">
          <span className="text-6xl mb-4 block">📄</span>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No quotes yet</h3>
          <p className="text-gray-600 mb-6">Request a quote from your cart to see it here</p>
          <Link
            href="/shop"
            className="inline-block px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <p className="text-gray-600 mt-1">View all your quote requests</p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search by Quote Number
            </label>
            <input
              type="text"
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quotes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* Status Filter */}
          <div className="md:w-48">
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="all">All ({statusCounts.all})</option>
              <option value="pending">Pending ({statusCounts.pending})</option>
              <option value="sent">Sent ({statusCounts.sent})</option>
              <option value="accepted">Accepted ({statusCounts.accepted})</option>
              <option value="rejected">Rejected ({statusCounts.rejected})</option>
              <option value="expired">Expired ({statusCounts.expired})</option>
            </select>
          </div>

          {/* Sort */}
          <div className="md:w-48">
            <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              id="sort"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="amount-desc">Highest Amount</option>
              <option value="amount-asc">Lowest Amount</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedQuotes.size > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {selectedQuotes.size} quote{selectedQuotes.size !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedQuotes(new Set())}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Clear Selection
                </button>
                {selectedQuotes.size >= 2 && selectedQuotes.size <= 5 && (
                  <button
                    onClick={() => {
                      const selectedIds = Array.from(selectedQuotes);
                      router.push(`/dashboard/quotes/compare?ids=${selectedIds.join(',')}`);
                    }}
                    className="px-3 py-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    Compare Selected
                  </button>
                )}
                <button
                  onClick={() => {
                    // Bulk action placeholder - can be extended later
                    success(`${selectedQuotes.size} quotes selected`);
                  }}
                  className="px-3 py-1.5 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  More Actions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Count */}
      {filteredAndSortedQuotes.length !== quotes.length && (
        <div className="text-sm text-gray-600">
          Showing {filteredAndSortedQuotes.length} of {quotes.length} quotes
        </div>
      )}

      <div className="space-y-3">
        {filteredAndSortedQuotes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <span className="text-6xl mb-4 block">🔍</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No quotes found</h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters or search query'
                : 'Request a quote from your cart to see it here'}
            </p>
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="inline-block px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          filteredAndSortedQuotes.map((quote) => (
            <div
              key={quote.id}
              className={`bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
                selectedQuotes.has(quote.id) ? 'border-teal-500 ring-2 ring-teal-200' : 'border-gray-200'
              }`}
            >
              {/* Selection Checkbox */}
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedQuotes.has(quote.id)}
                  onChange={() => handleSelectQuote(quote.id)}
                  className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Quote #</p>
                      <p className="text-base font-semibold text-gray-900">
                        {quote.quote_number || quote.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Date</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(quote.created_at || quote.date || 0).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          quote.status === 'accepted'
                            ? 'bg-green-100 text-green-800'
                            : quote.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : quote.status === 'sent'
                            ? 'bg-blue-100 text-blue-800'
                            : quote.status === 'expired'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                      </span>
                    </div>
                    {quote.expires_at && (() => {
                      // Cast to Quote type for getExpiryStatus (it only needs expires_at)
                      const expiryStatus = getExpiryStatus({
                        ...quote,
                        user_email: quote.user_email || '',
                        user_name: quote.user_name || '',
                        updated_at: quote.updated_at || quote.created_at || new Date().toISOString(),
                      } as Quote);
                      return (
                        <div>
                          <p className="text-xs text-gray-500">Expires</p>
                          <p className={`text-sm font-medium ${
                            expiryStatus.status === 'expired' 
                              ? 'text-red-600' 
                              : expiryStatus.status === 'expiring_soon'
                              ? 'text-yellow-600'
                              : 'text-gray-900'
                          }`}>
                            {new Date(quote.expires_at).toLocaleDateString()}
                          </p>
                          {expiryStatus.status !== 'valid' && (
                            <p className={`text-xs mt-0.5 ${
                              expiryStatus.status === 'expired' 
                                ? 'text-red-600' 
                                : 'text-yellow-600'
                            }`}>
                              {expiryStatus.message}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="text-base font-semibold text-gray-900">
                        ${quote.total.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-900 mb-2">Items ({quote.items.length})</p>
                    <div className="space-y-2">
                      {quote.items.map((item, index) => {
                        const quantity = item.quantity || item.qty || 1;
                        const price = Number(item.price) || 0;
                        return (
                          <div key={index} className="flex justify-between text-sm text-gray-600">
                            <span>
                              {item.name} {item.sku && `(${item.sku})`} × {quantity}
                            </span>
                            <span className="font-medium">${(price * quantity).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {quote.notes && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs font-medium text-gray-700 mb-1">Your Notes:</p>
                        <p className="text-sm text-gray-600 italic">{quote.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <p>Subtotal: ${quote.subtotal.toFixed(2)}</p>
                      {quote.shipping > 0 && <p>Shipping: ${quote.shipping.toFixed(2)}</p>}
                      {quote.discount > 0 && <p className="text-emerald-600">Discount: -${quote.discount.toFixed(2)}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-lg font-bold text-gray-900">${quote.total.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* View Details Link */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/quotes/${quote.id}`}
                        className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                      >
                        View Details
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => handleDeleteQuote(quote.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                      >
                        Delete
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

