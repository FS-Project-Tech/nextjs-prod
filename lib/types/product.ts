import type { ImageData, Timestamps, MetaData } from "./common";

/**
 * Unified product type for ProductCard and related components
 * This type is used across ProductsSlider, RecommendedSection, RecentlyViewedSection, etc.
 */
export interface ProductCardProduct {
  id: number;
  slug: string;
  name: string;
  sku?: string | null;
  price: string;
  regular_price?: string;
  sale_price?: string;
  on_sale?: boolean;
  /** Sale/discount percentage from backend (meta or description). Shown on card when set. */
  sale_percentage?: number | null;
  /** Product tags from WooCommerce (e.g. Empower, New product) */
  tags?: Array<{ id: number; name: string; slug: string }>;
  tax_class?: string;
  tax_status?: string;
  average_rating?: string;
  rating_count?: number;
  images?: {
    src: string;
    alt?: string;
  }[];
  // ✅ ADD THIS
  image?: string;
  image_alt?: string;
}

/**
 * Full WooCommerce product type
 */
export interface WooCommerceProduct extends ProductCardProduct, Timestamps {
  type: "simple" | "grouped" | "external" | "variable";
  status: "draft" | "pending" | "private" | "publish";
  featured: boolean;
  catalog_visibility: "visible" | "catalog" | "search" | "hidden";
  description?: string;
  short_description?: string;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  stock_quantity?: number;
  manage_stock?: boolean;
  backorders?: "no" | "notify" | "yes";
  categories?: Array<{ id: number; name: string; slug: string }>;
  tags?: Array<{ id: number; name: string; slug: string }>;
  attributes?: ProductAttribute[];
  default_attributes?: ProductAttribute[];
  variations?: number[];
  meta_data?: MetaData[];
}

/**
 * Product attribute
 */
export interface ProductAttribute {
  id: number;
  name: string;
  slug: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

/**
 * Product variation
 */
export interface ProductVariation {
  id: number;
  product_id: number;
  sku?: string;
  price: string;
  regular_price?: string;
  sale_price?: string;
  on_sale?: boolean;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  stock_quantity?: number;
  attributes: Array<{ id: number; name: string; option: string }>;
  image?: ImageData;
}

/**
 * Alias for backward compatibility
 */
export type UnifiedProduct = ProductCardProduct;
export type Product = ProductCardProduct;
