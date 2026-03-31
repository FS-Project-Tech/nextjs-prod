"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { useCart } from '@/components/CartProvider';
import { formatPrice } from '@/lib/format-utils';
import type { QuoteTemplate } from '@/lib/types/quote-template';

export default function QuoteTemplatesPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const { clear: clearCart, addItem } = useCart();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/quote-templates', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    setDeletingId(templateId);
    try {
      const response = await fetch(`/api/dashboard/quote-templates/${templateId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete template');
      }

      success('Template deleted successfully');
      fetchTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadTemplate = async (template: QuoteTemplate) => {
    setLoadingTemplateId(template.id);
    try {
      // Clear current cart
      clearCart();

      // Add template items to cart
      for (const item of template.items) {
        // Skip items without product_id
        if (!item.product_id) {
          continue;
        }
        
        // Generate slug from name (simple slug conversion)
        const slug = item.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'product';
        
        await addItem({
          productId: item.product_id,
          slug: slug,
          name: item.name,
          price: String(item.price),
          qty: item.qty,
          sku: item.sku || undefined,
          attributes: item.attributes || {},
          variationId: item.variation_id,
        });
      }

      success(`Template "${template.name}" loaded into cart`);
      
      // Redirect to cart or shop
      setTimeout(() => {
        router.push('/cart');
      }, 500);
    } catch (err: any) {
      showError(err.message || 'Failed to load template');
    } finally {
      setLoadingTemplateId(null);
    }
  };

  const calculateTemplateTotal = (template: QuoteTemplate): number => {
    return template.items.reduce((sum, item) => {
      return sum + (Number(item.price) * item.qty);
    }, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote Templates</h1>
          <p className="text-gray-600 mt-1">
            Save and reuse quote configurations for quick quote requests
          </p>
        </div>
        <Link
          href="/dashboard/quotes"
          className="text-teal-600 hover:text-teal-700 flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Back to Quotes
        </Link>
      </div>

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No templates yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Create your first template by saving a quote request configuration.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            You can save templates from the quote request modal or from existing quotes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {template.name}
                    {template.is_default && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded">
                        Default
                      </span>
                    )}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                  )}
                </div>
              </div>

              {/* Template Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-medium text-gray-900">
                    {template.items.length} {template.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Estimated Total:</span>
                  <span className="font-semibold text-teal-600">
                    {formatPrice(calculateTemplateTotal(template))}
                  </span>
                </div>
                {template.shipping_method && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Shipping:</span>
                    <span className="text-gray-900">{template.shipping_method}</span>
                  </div>
                )}
                {template.usage_count !== undefined && template.usage_count > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Used:</span>
                    <span className="text-gray-900">{template.usage_count} times</span>
                  </div>
                )}
              </div>

              {/* Template Items Preview */}
              {template.items.length > 0 && (
                <div className="mb-4 pt-4 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-700 mb-2">Items:</p>
                  <ul className="space-y-1">
                    {template.items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-xs text-gray-600">
                        • {item.name} (Qty: {item.qty})
                      </li>
                    ))}
                    {template.items.length > 3 && (
                      <li className="text-xs text-gray-500">
                        +{template.items.length - 3} more items
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleLoadTemplate(template)}
                  disabled={loadingTemplateId === template.id}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loadingTemplateId === template.id ? (
                    <>
                      <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                      Loading...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Load to Cart
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  disabled={deletingId === template.id}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete template"
                >
                  {deletingId === template.id ? (
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-gray-600 border-r-transparent"></div>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

