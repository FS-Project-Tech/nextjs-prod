/**
 * Wishlist Types
 * Type definitions for the wishlist feature
 */

/**
 * Wishlist item stored in database
 */
export interface WishlistItem {
  productId: number;
  addedAt: string; // ISO date string
}

/**
 * Wishlist with product details for display
 */
export interface WishlistProduct {
  id: number;
  name: string;
  slug: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  images: Array<{ id: number; src: string; alt: string; name?: string }>;
  average_rating?: string;
  rating_count?: number;
  sku?: string;
  categories?: Array<{ id: number; name: string; slug: string }>;
}

/**
 * API response types
 */
export interface WishlistResponse {
  success: boolean;
  wishlist: number[];
  message?: string;
}

export interface WishlistProductsResponse {
  success: boolean;
  products: WishlistProduct[];
  total: number;
}

/**
 * Wishlist context state
 */
export interface WishlistState {
  items: number[];
  products: WishlistProduct[];
  isLoading: boolean;
  isLoadingProducts: boolean;
  error: string | null;
}

/**
 * Wishlist context actions
 */
export interface WishlistActions {
  addToWishlist: (productId: number) => Promise<boolean>;
  removeFromWishlist: (productId: number) => Promise<boolean>;
  isInWishlist: (productId: number) => boolean;
  refreshWishlist: () => Promise<void>;
  clearWishlist: () => void;
}

/**
 * Complete wishlist context type
 */
export interface WishlistContextType extends WishlistState, WishlistActions {}

/**
 * Wishlist storage key
 */
export const WISHLIST_STORAGE_KEY = 'user_wishlist';
export const WISHLIST_COOKIE_NAME = 'wishlist_items';

