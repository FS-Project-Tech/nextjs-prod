"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { useCart } from '@/components/CartProvider';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/lib/format-utils';
import { getExpiryStatus, isQuoteExpired } from '@/lib/quote-expiry';
import type { Quote, QuoteStatusHistory, QuoteComment } from '@/lib/types/quote';

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params?.id as string;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showInternalNote, setShowInternalNote] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { success, error: showError } = useToast();
  const { clear: clearCart, addItem } = useCart();
  const { user } = useAuth();

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/dashboard/quotes/${quoteId}`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quote');
        }

        const data = await response.json();
        setQuote(data.quote);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to load quote';
        setError(errorMessage);
        showError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (quoteId) {
      fetchQuote();
    }
    // showError is a stable function reference, no need in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const handleStatusUpdate = async (status: Quote['status'], reason?: string) => {
    if (!quote) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/dashboard/quotes/${quoteId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          status,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      setQuote(data.quote);
      success(`Quote ${status} successfully`);
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConvertToOrder = async () => {
    if (!quote) return;

    setIsConverting(true);
    try {
      // Fetch quote conversion data
      const response = await fetch(`/api/dashboard/quotes/${quoteId}/convert`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to convert quote');
      }

      // Clear existing cart
      clearCart();

      // Add quote items to cart
      for (const item of data.items) {
        if (item.product_id > 0) {
          // Generate slug from name (simple slug conversion)
          const slug = item.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'product';
          
          addItem({
            productId: item.product_id,
            variationId: item.variation_id,
            name: item.name,
            slug: slug,
            price: String(item.price),
            qty: item.quantity,
            sku: item.sku,
            attributes: item.attributes || {},
            deliveryPlan: item.deliveryPlan,
          });
        }
      }

      // Store quote info in sessionStorage for checkout
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('quote_conversion', JSON.stringify({
          quote_id: data.quote_id,
          quote_number: data.quote_number,
          subtotal: data.subtotal,
          shipping: data.shipping,
          shipping_method: data.shipping_method,
          discount: data.discount,
          total: data.total,
          notes: data.notes,
        }));
      }

      success('Quote items added to cart');
      
      // Redirect to checkout with quote parameter
      router.push(`/checkout?quote=${quoteId}`);
    } catch (err: any) {
      showError(err.message || 'Failed to convert quote to order');
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quote) return;
    
    setIsGeneratingPDF(true);
    try {
      const { generateQuotePDF } = await import('@/lib/quote-pdf');
      const blob = await generateQuotePDF(quote);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.quote_number || quote.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      success('PDF downloaded successfully');
    } catch (err: any) {
      showError(err.message || 'Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleRenewQuote = async (additionalDays: number = 30) => {
    if (!quote) return;

    setIsRenewing(true);
    try {
      const response = await fetch(`/api/dashboard/quotes/${quoteId}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ additionalDays }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to renew quote');
      }

      setQuote(data.quote);
      success(`Quote renewed for ${additionalDays} additional days`);
    } catch (err: any) {
      showError(err.message || 'Failed to renew quote');
    } finally {
      setIsRenewing(false);
    }
  };

  const handleDeleteQuote = async () => {
    if (!quote) return;
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
      router.push('/dashboard/quotes');
    } catch (err: any) {
      showError(err.message || 'Failed to delete quote');
    }
  };

  const isAdmin = user?.roles?.includes('administrator') || user?.roles?.includes('shop_manager');
  const isOwner = quote?.user_email.toLowerCase() === user?.email?.toLowerCase();

  const handleAddComment = async () => {
    if (!quote || !newComment.trim()) return;

    setIsAddingComment(true);
    try {
      const response = await fetch(`/api/dashboard/quotes/${quoteId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          content: newComment.trim(),
          isInternal: showInternalNote && isAdmin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add comment');
      }

      // Refresh quote to get updated comments
      const quoteResponse = await fetch(`/api/dashboard/quotes/${quoteId}`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        setQuote(quoteData.quote);
      }

      setNewComment('');
      setShowInternalNote(false);
      success('Comment added successfully');
      
      // Scroll to new comment
      setTimeout(() => {
        const commentsSection = document.getElementById('quote-comments');
        if (commentsSection) {
          commentsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } catch (err: any) {
      showError(err.message || 'Failed to add comment');
    } finally {
      setIsAddingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading quote...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) {
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
          <p className="text-red-800">{error || 'Quote not found'}</p>
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
          <h1 className="text-2xl font-bold text-gray-900">
            Quote {quote.quote_number || quote.id}
          </h1>
          <p className="text-gray-600 mt-1">
            Created on {new Date(quote.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGeneratingPDF ? (
              <>
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                Generating...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </>
            )}
          </button>
          <button
            onClick={handleDeleteQuote}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Delete
          </button>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quote.status)}`}>
              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Status Actions */}
      {quote.status === 'sent' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 mb-3">
            A quote has been sent to you. Would you like to accept or reject it?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleStatusUpdate('accepted')}
              disabled={isUpdating}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Accept Quote
            </button>
            <button
              onClick={() => {
                const reason = prompt('Please provide a reason for rejection (optional):');
                if (reason !== null) {
                  handleStatusUpdate('rejected', reason || undefined);
                }
              }}
              disabled={isUpdating}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reject Quote
            </button>
          </div>
        </div>
      )}

      {/* Convert to Order Action */}
      {quote.status === 'accepted' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800 mb-3">
            This quote has been accepted. You can now convert it to an order.
          </p>
          <button
            onClick={handleConvertToOrder}
            disabled={isConverting}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
          >
            {isConverting ? (
              <>
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                Converting...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Convert to Order
              </>
            )}
          </button>
        </div>
      )}

      {/* Quote Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Details</h2>

        {/* Items */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Items ({quote.items.length})</h3>
          <div className="space-y-3">
            {quote.items.map((item, index) => {
              const quantity = item.qty || 1;
              const price = Number(item.price) || 0;
              return (
                <div key={index} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.sku && (
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Quantity: {quantity} × {formatPrice(price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatPrice(price * quantity)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Pricing Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="text-gray-900">{formatPrice(quote.subtotal)}</span>
            </div>
            {quote.shipping > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping:</span>
                <span className="text-gray-900">{formatPrice(quote.shipping)}</span>
              </div>
            )}
            {quote.discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount:</span>
                <span>−{formatPrice(quote.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
              <span className="text-gray-900">Total:</span>
              <span className="text-teal-600">{formatPrice(quote.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Your Notes</h3>
            <p className="text-sm text-gray-600 italic">{quote.notes}</p>
          </div>
        )}

        {/* Expiry */}
        {quote.expires_at && (() => {
          const expiryStatus = getExpiryStatus(quote);
          const isExpired = isQuoteExpired(quote);
          
          return (
            <div className={`mt-4 pt-4 border-t ${
              expiryStatus.status === 'expired' 
                ? 'bg-red-50 border-red-200 rounded-lg p-4 -mt-4 -pt-4'
                : expiryStatus.status === 'expiring_soon'
                ? 'bg-yellow-50 border-yellow-200 rounded-lg p-4 -mt-4 -pt-4'
                : ''
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Expires on</p>
                  <p className={`text-sm font-medium ${
                    expiryStatus.status === 'expired' 
                      ? 'text-red-600' 
                      : expiryStatus.status === 'expiring_soon'
                      ? 'text-yellow-600'
                      : 'text-gray-900'
                  }`}>
                    {new Date(quote.expires_at).toLocaleDateString()}
                  </p>
                  <p className={`text-xs mt-1 ${
                    expiryStatus.status === 'expired' 
                      ? 'text-red-600' 
                      : expiryStatus.status === 'expiring_soon'
                      ? 'text-yellow-600'
                      : 'text-gray-500'
                  }`}>
                    {expiryStatus.message}
                  </p>
                </div>
                {!isExpired && quote.status !== 'expired' && (
                  <button
                    onClick={() => handleRenewQuote(30)}
                    disabled={isRenewing}
                    className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRenewing ? 'Renewing...' : 'Renew (+30 days)'}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Comments Section */}
      <div id="quote-comments" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Comments & Notes</h2>

        {/* Existing Comments */}
        {quote.comments && quote.comments.length > 0 ? (
          <div className="space-y-4 mb-6">
            {quote.comments
              .filter(comment => {
                // Show all comments to admins, hide internal notes from customers
                if (isAdmin) return true;
                return !comment.is_internal;
              })
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((comment) => (
                <div
                  key={comment.id}
                  className={`p-4 rounded-lg ${
                    comment.is_internal
                      ? 'bg-purple-50 border border-purple-200'
                      : comment.author_type === 'admin'
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${
                        comment.author_type === 'admin' ? 'text-blue-700' : 'text-gray-700'
                      }`}>
                        {comment.author}
                      </span>
                      {comment.is_internal && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                          Internal
                        </span>
                      )}
                      {comment.author_type === 'admin' && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                  {comment.updated_at && comment.updated_at !== comment.created_at && (
                    <p className="text-xs text-gray-500 mt-2 italic">
                      Edited {new Date(comment.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 mb-6">
            <p className="text-sm">No comments yet. Start the conversation below.</p>
          </div>
        )}

        {/* Add Comment Form */}
        <div className="border-t pt-4">
          <label htmlFor="new-comment" className="block text-sm font-medium text-gray-700 mb-2">
            Add a comment
          </label>
          <textarea
            id="new-comment"
            ref={commentTextareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type your comment here..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
          />
          {isAdmin && (
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={showInternalNote}
                onChange={(e) => setShowInternalNote(e.target.checked)}
                className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-600">Internal note (only visible to admins)</span>
            </label>
          )}
          <button
            onClick={handleAddComment}
            disabled={isAddingComment || !newComment.trim()}
            className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAddingComment ? (
              <>
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                Adding...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Comment
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status History Timeline */}
      {quote.status_history && quote.status_history.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status History</h2>
          <div className="space-y-4">
            {quote.status_history
              .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
              .map((entry, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(entry.status).split(' ')[0]}`}></div>
                    {index < quote.status_history!.length - 1 && (
                      <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${getStatusColor(entry.status)} px-2 py-1 rounded`}>
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.changed_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.changed_by && (
                      <p className="text-xs text-gray-600 mb-1">
                        Changed by: {entry.changed_by}
                      </p>
                    )}
                    {entry.reason && (
                      <p className="text-xs text-gray-600 mb-1">
                        Reason: {entry.reason}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-gray-600 italic">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

