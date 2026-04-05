"use client";

import { useWishlist } from "@/contexts/WishlistContext";
import Link from "next/link";
import { useState, useCallback } from "react";
import ProductCard from "@/components/ProductCard";

/**
 * Wishlist Product Card Wrapper
 * Wraps the standard ProductCard with a remove button overlay
 */
function WishlistProductWrapper({
  product,
  onRemove,
  isRemoving,
}: {
  product: any;
  onRemove: (id: number) => void;
  isRemoving: boolean;
}) {
  return (
    <div className="relative group/wrapper">
      {/* Remove Button - positioned above the card */}
      <button
        onClick={() => onRemove(product.id)}
        disabled={isRemoving}
        className="absolute -top-2 -right-2 z-20 p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50 opacity-0 group-hover/wrapper:opacity-100 focus:opacity-100"
        aria-label="Remove from wishlist"
        title="Remove from wishlist"
      >
        {isRemoving ? (
          <svg className="w-4 h-4 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Reuse the standard ProductCard */}
      <ProductCard
        id={product.id}
        slug={product.slug}
        name={product.name}
        sku={product.sku}
        price={product.price}
        sale_price={product.sale_price}
        regular_price={product.regular_price}
        on_sale={product.on_sale}
        // imageUrl={product.images?.[0]?.src}
        // imageAlt={product.images?.[0]?.alt || product.name}
        tax_class={product.tax_class}
        tax_status={product.tax_status}
        average_rating={product.average_rating}
        rating_count={product.rating_count}
        imageUrl={
          (typeof product.image === "string"
            ? product.image
            : product.image?.src || product.image?.thumbnail) || product.images?.[0]?.src
        }
        imageAlt={product.image_alt || product.images?.[0]?.alt || product.name}
      />
    </div>
  );
}

/**
 * Empty Wishlist Component
 */
function EmptyWishlist() {
  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
        <svg
          className="w-12 h-12 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Your wishlist is empty</h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Save your favorite products here by clicking the heart icon on any product.
      </p>
      <Link
        href="/shop"
        className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
        Start Shopping
      </Link>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function WishlistSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-1/4" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Wishlist Page
 */
export default function WishlistPage() {
  const { items, products, isLoading, isLoadingProducts, removeFromWishlist } = useWishlist();
  const [removingId, setRemovingId] = useState<number | null>(null);

  const handleRemove = useCallback(
    async (productId: number) => {
      setRemovingId(productId);
      await removeFromWishlist(productId);
      setRemovingId(null);
    },
    [removeFromWishlist]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wishlist</h1>
          <p className="text-gray-600 mt-1">
            {isLoading
              ? "Loading..."
              : `${items.length} ${items.length === 1 ? "item" : "items"} saved`}
          </p>
        </div>

        {items.length > 0 && (
          <Link
            href="/shop"
            className="text-teal-600 hover:text-teal-700 font-medium text-sm flex items-center gap-1"
          >
            Continue Shopping
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Content */}
      {isLoading || isLoadingProducts ? (
        <WishlistSkeleton />
      ) : items.length === 0 ? (
        <EmptyWishlist />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
          {products.map((product) => (
            <WishlistProductWrapper
              key={product.id}
              product={product}
              onRemove={handleRemove}
              isRemoving={removingId === product.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
