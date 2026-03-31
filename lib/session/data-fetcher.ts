/**
 * Session-Aware Data Fetcher
 * Fetches accurate data with proper session context and caching
 */

import {
  SessionData,
  SessionFetchResult,
  SessionErrorCode,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  secureFetch,
  sessionGet,
  sessionPost,
} from './secure-fetch';
import { createSessionError } from './manager';
import { getWpBaseUrl } from '../wp-utils';
import { 
  normalizeError,           // For converting errors to AppError
  getErrorMessage,          // For safe error.message access
  getErrorName,             // For safe error.name access
  isAbortError,             // For checking AbortError
  isTimeoutError,           // For checking timeout errors
  hasAxiosResponse,         // For checking axios-style errors
  getAxiosErrorDetails,     // For safe axios error property access
  isRetryableError          // For checking if error is retryable
} from '@/lib/utils/errors';

/**
 * Data cache with TTL support
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
}

const dataCache = new Map<string, CacheEntry<unknown>>();

/**
 * Default cache TTL values (in milliseconds)
 */
export const CACHE_TTL = {
  PRODUCTS: 5 * 60 * 1000,      // 5 minutes for product lists
  PRODUCT: 10 * 60 * 1000,       // 10 minutes for single product
  CATEGORIES: 30 * 60 * 1000,   // 30 minutes for categories
  CART: 0,                       // Never cache cart (always fresh)
  USER: 5 * 60 * 1000,          // 5 minutes for user data
  ORDERS: 2 * 60 * 1000,        // 2 minutes for orders
};

/**
 * Generate cache key
 */
function generateCacheKey(endpoint: string, params?: Record<string, unknown>): string {
  const sortedParams = params
    ? Object.keys(params)
        .sort()
        .map(k => `${k}=${String(params[k])}`)
        .join('&')
    : '';
  return `${endpoint}${sortedParams ? `?${sortedParams}` : ''}`;
}

/**
 * Get cached data
 */
function getCached<T>(key: string): T | null {
  const entry = dataCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    dataCache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Set cached data
 */
function setCache<T>(key: string, data: T, ttl: number, etag?: string): void {
  dataCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
    etag,
  });
}

/**
 * Invalidate cache by pattern
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    dataCache.clear();
    return;
  }
  
  for (const key of dataCache.keys()) {
    if (key.includes(pattern)) {
      dataCache.delete(key);
    }
  }
}

/**
 * WooCommerce API configuration
 */
function getWcApiConfig() {
  const apiUrl = process.env.WC_API_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;
  
  if (!apiUrl || !consumerKey || !consumerSecret) {
    return null;
  }
  
  return {
    baseUrl: apiUrl,
    auth: Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64'),
  };
}

/**
 * Build WooCommerce API URL with authentication
 */
function buildWcUrl(endpoint: string, params?: Record<string, unknown>): string {
  const config = getWcApiConfig();
  if (!config) {
    throw new Error('WooCommerce API not configured');
  }
  
  const url = new URL(endpoint, config.baseUrl);
  
  // Add consumer credentials as query params (required by some hosts)
  url.searchParams.set('consumer_key', process.env.WC_CONSUMER_KEY || '');
  url.searchParams.set('consumer_secret', process.env.WC_CONSUMER_SECRET || '');
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  
  return url.toString();
}

/**
 * Fetch with WooCommerce authentication
 */
async function wcFetch<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options: {
    session?: SessionData | null;
    method?: string;
    body?: unknown;
    cache?: boolean;
    ttl?: number;
  } = {}
): Promise<SessionFetchResult<T>> {
  const {
    session = null,
    method = 'GET',
    body,
    cache = true,
    ttl = CACHE_TTL.PRODUCTS,
  } = options;
  
  // Check cache for GET requests
  const cacheKey = generateCacheKey(endpoint, params);
  if (cache && method === 'GET') {
    const cached = getCached<T>(cacheKey);
    if (cached) {
      return {
        data: cached,
        error: null,
        status: 200,
        cached: true,
        sessionValid: true,
      };
    }
  }
  
  try {
    const url = buildWcUrl(endpoint, params);
    const config = getWcApiConfig();
    
    if (!config) {
      return {
        data: null,
        error: createSessionError(
          SessionErrorCode.VALIDATION_FAILED,
          'WooCommerce API not configured',
          false
        ),
        status: 500,
        cached: false,
        sessionValid: true,
      };
    }
    
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${config.auth}`,
    };
    
    // Add session token if available
    if (session?.token) {
      headers['X-WP-Token'] = session.token;
    }
    
    // Add cart session if available
    if (session?.cart?.cartKey) {
      headers['X-WC-Session'] = session.cart.cartKey;
    }
    
    const result = await secureFetch<T>(url, session, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout: DEFAULT_SESSION_CONFIG.networkTimeout,
      retries: 2,
      skipCache: !cache,
    });
    
    // Cache successful GET responses
    if (cache && method === 'GET' && result.data && !result.error) {
      setCache(cacheKey, result.data, ttl);
    }
    
    return result;
  } catch (error: unknown) {
    return {
      data: null,
      error: createSessionError(
        SessionErrorCode.NETWORK_ERROR,
        getErrorMessage(error),
        true
      ),
      status: 0,
      cached: false,
      sessionValid: session?.status === 'valid',
    };
  }
}

/**
 * Product interface
 */
export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  stock_quantity: number | null;
  images: Array<{ id: number; src: string; name: string; alt: string }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  attributes: Array<{ id: number; name: string; options: string[] }>;
  variations: number[];
  average_rating: string;
  rating_count: number;
  featured: boolean;
  meta_data?: Array<{ key: string; value: unknown }>;
}

/**
 * Category interface
 */
export interface WCCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
  image: { id: number; src: string; name: string; alt: string } | null;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

/**
 * Fetch products with session context
 */
export async function fetchProductsWithSession(
  session: SessionData | null,
  params: {
    page?: number;
    perPage?: number;
    category?: number | string;
    search?: string;
    featured?: boolean;
    onSale?: boolean;
    minPrice?: number;
    maxPrice?: number;
    orderBy?: string;
    order?: 'asc' | 'desc';
    include?: number[];
    exclude?: number[];
  } = {}
): Promise<SessionFetchResult<PaginatedResponse<WCProduct>>> {
  const wcParams: Record<string, unknown> = {
    per_page: params.perPage || 24,
    page: params.page || 1,
  };
  
  if (params.category) {
    wcParams.category = params.category;
  }
  if (params.search) {
    wcParams.search = params.search;
  }
  if (params.featured !== undefined) {
    wcParams.featured = params.featured;
  }
  if (params.onSale !== undefined) {
    wcParams.on_sale = params.onSale;
  }
  if (params.minPrice !== undefined) {
    wcParams.min_price = params.minPrice;
  }
  if (params.maxPrice !== undefined) {
    wcParams.max_price = params.maxPrice;
  }
  if (params.orderBy) {
    wcParams.orderby = params.orderBy;
    wcParams.order = params.order || 'desc';
  }
  if (params.include?.length) {
    wcParams.include = params.include.join(',');
  }
  if (params.exclude?.length) {
    wcParams.exclude = params.exclude.join(',');
  }
  
  const result = await wcFetch<WCProduct[]>('/products', wcParams, {
    session,
    ttl: CACHE_TTL.PRODUCTS,
  });
  
  if (result.error || !result.data) {
    return {
      ...result,
      data: null,
    };
  }
  
  // WooCommerce returns total/totalPages in headers, but we can't access them here
  // So we estimate based on response
  const total = result.data.length < (params.perPage || 24) 
    ? (params.page || 1) * result.data.length
    : result.data.length * 10; // Estimate
  
  return {
    ...result,
    data: {
      data: result.data,
      total,
      totalPages: Math.ceil(total / (params.perPage || 24)),
      page: params.page || 1,
      perPage: params.perPage || 24,
    },
  };
}

/**
 * Fetch single product by ID or slug
 */
export async function fetchProductWithSession(
  session: SessionData | null,
  idOrSlug: number | string
): Promise<SessionFetchResult<WCProduct>> {
  const isNumeric = typeof idOrSlug === 'number' || !isNaN(Number(idOrSlug));
  
  if (isNumeric) {
    return wcFetch<WCProduct>(`/products/${idOrSlug}`, undefined, {
      session,
      ttl: CACHE_TTL.PRODUCT,
    });
  }
  
  // Fetch by slug
  const result = await wcFetch<WCProduct[]>('/products', { slug: idOrSlug }, {
    session,
    ttl: CACHE_TTL.PRODUCT,
  });
  
  if (result.error || !result.data?.length) {
    return {
      data: null,
      error: result.error || createSessionError(
        SessionErrorCode.VALIDATION_FAILED,
        `Product with slug "${idOrSlug}" not found`,
        false
      ),
      status: result.status || 404,
      cached: result.cached,
      sessionValid: result.sessionValid,
    };
  }
  
  return {
    ...result,
    data: result.data[0],
  };
}

/**
 * Fetch categories with session context
 */
export async function fetchCategoriesWithSession(
  session: SessionData | null,
  params: {
    parent?: number;
    hideEmpty?: boolean;
    perPage?: number;
  } = {}
): Promise<SessionFetchResult<WCCategory[]>> {
  const wcParams: Record<string, unknown> = {
    per_page: params.perPage || 100,
    hide_empty: params.hideEmpty ?? true,
  };
  
  if (params.parent !== undefined) {
    wcParams.parent = params.parent;
  }
  
  return wcFetch<WCCategory[]>('/products/categories', wcParams, {
    session,
    ttl: CACHE_TTL.CATEGORIES,
  });
}

/**
 * Fetch product variations
 */
export async function fetchVariationsWithSession(
  session: SessionData | null,
  productId: number
): Promise<SessionFetchResult<WCProduct[]>> {
  return wcFetch<WCProduct[]>(`/products/${productId}/variations`, { per_page: 100 }, {
    session,
    ttl: CACHE_TTL.PRODUCT,
  });
}

/**
 * Fetch product reviews
 */
export async function fetchReviewsWithSession(
  session: SessionData | null,
  productId: number,
  params: {
    page?: number;
    perPage?: number;
  } = {}
): Promise<SessionFetchResult<Array<{
  id: number;
  date_created: string;
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
}>>> {
  return wcFetch(`/products/reviews`, {
    product: productId,
    page: params.page || 1,
    per_page: params.perPage || 10,
  }, {
    session,
    ttl: CACHE_TTL.PRODUCTS,
  });
}

/**
 * Search products
 */
export async function searchProductsWithSession(
  session: SessionData | null,
  query: string,
  params: {
    page?: number;
    perPage?: number;
  } = {}
): Promise<SessionFetchResult<PaginatedResponse<WCProduct>>> {
  return fetchProductsWithSession(session, {
    search: query,
    page: params.page,
    perPage: params.perPage,
  });
}

/**
 * Fetch related products
 */
export async function fetchRelatedProductsWithSession(
  session: SessionData | null,
  productId: number,
  limit: number = 4
): Promise<SessionFetchResult<WCProduct[]>> {
  // First get the product to find related IDs
  const productResult = await fetchProductWithSession(session, productId);
  
  if (productResult.error || !productResult.data) {
    return {
      data: null,
      error: productResult.error,
      status: productResult.status,
      cached: false,
      sessionValid: productResult.sessionValid,
    };
  }
  
  const product = productResult.data;
  const relatedIds = (product as unknown as { related_ids?: number[] }).related_ids || [];
  
  if (!relatedIds.length) {
    return {
      data: [],
      error: null,
      status: 200,
      cached: false,
      sessionValid: true,
    };
  }
  
  return fetchProductsWithSession(session, {
    include: relatedIds.slice(0, limit),
    perPage: limit,
  }).then(result => ({
    ...result,
    data: result.data?.data || null,
  }));
}

/**
 * Fetch user orders
 */
export async function fetchOrdersWithSession(
  session: SessionData | null,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
  } = {}
): Promise<SessionFetchResult<Array<{
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  line_items: Array<{
    id: number;
    name: string;
    quantity: number;
    total: string;
    product_id: number;
    image?: { src: string };
  }>;
}>>> {
  if (!session?.user?.id) {
    return {
      data: null,
      error: createSessionError(
        SessionErrorCode.TOKEN_INVALID,
        'User not authenticated',
        false
      ),
      status: 401,
      cached: false,
      sessionValid: false,
    };
  }
  
  // Ensure customer ID is an integer (WooCommerce API requirement)
  const customerId = typeof session.user.id === 'string' 
    ? parseInt(session.user.id, 10) 
    : session.user.id;
  
  if (isNaN(customerId) || customerId <= 0) {
    return {
      data: null,
      error: createSessionError(
        SessionErrorCode.VALIDATION_FAILED,
        'Invalid customer ID',
        false
      ),
      status: 400,
      cached: false,
      sessionValid: true,
    };
  }
  
  return wcFetch('/orders', {
    customer: customerId,
    page: params.page || 1,
    per_page: params.perPage || 10,
    status: params.status || 'any',
  }, {
    session,
    cache: false, // Orders should always be fresh
    requireAuth: true,
  } as any);
}

/**
 * Create order
 */
export async function createOrderWithSession(
  session: SessionData | null,
  orderData: {
    payment_method: string;
    payment_method_title: string;
    billing: Record<string, string>;
    shipping?: Record<string, string>;
    line_items: Array<{
      product_id: number;
      quantity: number;
      variation_id?: number;
    }>;
    shipping_lines?: Array<{
      method_id: string;
      method_title: string;
      total: string;
    }>;
    coupon_lines?: Array<{ code: string }>;
  }
): Promise<SessionFetchResult<{ id: number; order_key: string; status: string }>> {
  // Add customer ID if authenticated (must be integer for WooCommerce API)
  const data: Record<string, unknown> = { ...orderData };
  if (session?.user?.id) {
    const customerId = typeof session.user.id === 'string' 
      ? parseInt(session.user.id, 10) 
      : session.user.id;
    
    if (!isNaN(customerId) && customerId > 0) {
      data.customer_id = customerId;
    }
  }
  
  return wcFetch('/orders', undefined, {
    session,
    method: 'POST',
    body: data,
    cache: false,
  });
}

/**
 * Get order by ID
 */
export async function fetchOrderWithSession(
  session: SessionData | null,
  orderId: number
): Promise<SessionFetchResult<{
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  line_items: Array<{
    id: number;
    name: string;
    quantity: number;
    total: string;
    product_id: number;
  }>;
  billing: Record<string, string>;
  shipping: Record<string, string>;
}>> {
  return wcFetch(`/orders/${orderId}`, undefined, {
    session,
    cache: false,
  });
}

/**
 * Prefetch critical data for a page
 */
export async function prefetchPageData(
  session: SessionData | null,
  page: 'home' | 'shop' | 'product',
  params?: Record<string, unknown>
): Promise<void> {
  switch (page) {
    case 'home':
      // Prefetch featured products and categories
      await Promise.all([
        fetchProductsWithSession(session, { featured: true, perPage: 8 }),
        fetchCategoriesWithSession(session, { parent: 0 }),
      ]);
      break;
      
    case 'shop':
      // Prefetch products and categories
      await Promise.all([
        fetchProductsWithSession(session, params as any),
        fetchCategoriesWithSession(session),
      ]);
      break;
      
    case 'product':
      if (params?.id || params?.slug) {
        await fetchProductWithSession(session, (params.id || params.slug) as number | string);
      }
      break;
  }
}

