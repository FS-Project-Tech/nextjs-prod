/**
 * Common Types
 * Shared utility types used across the application
 */

/**
 * Generic key-value pair
 */
export interface KeyValuePair<T = unknown> {
  key: string;
  value: T;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  per_page?: number;
}

/**
 * Sort parameters
 */
export interface SortParams {
  orderby?: string;
  order?: 'asc' | 'desc';
}

/**
 * Search parameters
 */
export interface SearchParams {
  search?: string;
  q?: string;
}

/**
 * Filter parameters
 */
export interface FilterParams {
  category?: number | string;
  tag?: number | string;
  attribute?: string;
  min_price?: number;
  max_price?: number;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
}

/**
 * Image data
 */
export interface ImageData {
  id: number;
  src: string;
  alt?: string;
  name?: string;
  width?: number;
  height?: number;
}

/**
 * Metadata entry
 */
export interface MetaData {
  id: number;
  key: string;
  value: unknown;
}

/**
 * Timestamp fields
 */
export interface Timestamps {
  date_created?: string;
  date_modified?: string;
  date_created_gmt?: string;
  date_modified_gmt?: string;
}

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Extract promise return type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

