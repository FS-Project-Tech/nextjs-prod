"use client";

import React, { memo, useCallback, useState } from "react";
import { useWishlist } from "@/contexts/WishlistContext";

/**
 * Heart icon SVG path
 */
const HEART_PATH =
  "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z";

/**
 * Props for WishlistButton
 */
interface WishlistButtonProps {
  productId: number;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button" | "card";
  showLabel?: boolean;
  className?: string;
  onSuccess?: () => void;
}

/**
 * Size configuration
 */
const sizeConfig = {
  sm: { icon: "h-4 w-4", button: "h-8 w-8", text: "text-xs" },
  md: { icon: "h-5 w-5", button: "h-10 w-10", text: "text-sm" },
  lg: { icon: "h-6 w-6", button: "h-12 w-12", text: "text-base" },
};

/**
 * WishlistButton Component
 * Reusable wishlist toggle button with various styles
 */
function WishlistButtonComponent({
  productId,
  size = "md",
  variant = "icon",
  showLabel = false,
  className = "",
  onSuccess,
}: WishlistButtonProps) {
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const [isLoading, setIsLoading] = useState(false);

  const wishlisted = isInWishlist(productId);
  const config = sizeConfig[size];

  /**
   * Handle click
   */
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isLoading) return;

      setIsLoading(true);

      try {
        let success: boolean;

        if (wishlisted) {
          success = await removeFromWishlist(productId);
        } else {
          success = await addToWishlist(productId);
        }

        if (success && onSuccess) {
          onSuccess();
        }
      } finally {
        setIsLoading(false);
      }
    },
    [productId, wishlisted, isLoading, addToWishlist, removeFromWishlist, onSuccess]
  );

  // Render based on variant
  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`
          inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg
          font-medium transition-all duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${
            wishlisted
              ? "bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 focus-visible:ring-rose-500"
              : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-rose-500 focus-visible:ring-gray-500"
          }
          ${className}
        `}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wishlisted}
      >
        {isLoading ? (
          <svg className={`animate-spin ${config.icon}`} fill="none" viewBox="0 0 24 24">
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
          <svg
            viewBox="0 0 24 24"
            className={config.icon}
            fill={wishlisted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d={HEART_PATH} />
          </svg>
        )}
        {showLabel && (
          <span className={config.text}>{wishlisted ? "In Wishlist" : "Add to Wishlist"}</span>
        )}
      </button>
    );
  }

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`
          absolute top-2 right-2 z-10
          ${config.button} rounded-full
          bg-white shadow-md
          flex items-center justify-center
          transition-all duration-200
          hover:scale-110
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${wishlisted ? "text-rose-500" : "text-gray-600 hover:text-rose-500"}
          ${className}
        `}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wishlisted}
      >
        {isLoading ? (
          <svg className={`animate-spin ${config.icon}`} fill="none" viewBox="0 0 24 24">
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
          <svg
            viewBox="0 0 24 24"
            className={config.icon}
            fill={wishlisted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d={HEART_PATH} />
          </svg>
        )}
      </button>
    );
  }

  // Default: icon variant
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`
        inline-flex items-center justify-center
        ${config.button} rounded-lg border
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${
          wishlisted
            ? "border-rose-500 bg-rose-50 text-rose-600 hover:bg-rose-100 focus-visible:ring-rose-500"
            : "border-gray-300 text-gray-500 hover:border-rose-400 hover:text-rose-500 focus-visible:ring-gray-500"
        }
        ${className}
      `}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={wishlisted}
    >
      {isLoading ? (
        <svg className={`animate-spin ${config.icon}`} fill="none" viewBox="0 0 24 24">
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
        <svg
          viewBox="0 0 24 24"
          className={config.icon}
          fill={wishlisted ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d={HEART_PATH} />
        </svg>
      )}
    </button>
  );
}

/**
 * Memoized export
 */
export const WishlistButton = memo(WishlistButtonComponent);

export default WishlistButton;
