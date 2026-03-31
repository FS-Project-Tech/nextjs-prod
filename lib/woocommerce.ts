import axios, { AxiosRequestHeaders } from 'axios';
import { validateEnvironmentVariables } from './env-validation';
import { normalizeError, getErrorMessage, hasAxiosResponse, getAxiosErrorDetails, isTimeoutError } from '@/lib/utils/errors';
import { getWpBaseUrl } from '@/lib/wp-utils';
import { extractProductBrands } from '@/lib/utils/product';

// Validate environment variables (server-side only)
if (typeof window === 'undefined') {
  const envCheck = validateEnvironmentVariables();
  if (!envCheck.valid) {
    if (envCheck.missing.length > 0) {
      console.error('❌ Missing required environment variables:', envCheck.missing.join(', '));
    }
    if (envCheck.invalid.length > 0) {
      console.error('❌ Invalid environment variables:');
      envCheck.invalid.forEach(({ name, reason }) => {
        console.error(`  - ${name}: ${reason}`);
      });
    }
    // Don't throw in development to allow graceful degradation
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Environment variable validation failed. Please check your .env.local file.');
    }
  }
}

const API_URL = process.env.WC_API_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

// WooCommerce API Client with timeout configuration
const WOOCOMMERCE_TIMEOUT = parseInt(process.env.WOOCOMMERCE_API_TIMEOUT || '30000', 10); // Default 30 seconds

const wcAPI = axios.create({
  baseURL: API_URL,
  auth: {
    username: CONSUMER_KEY || '',
    password: CONSUMER_SECRET || '',
  },
  timeout: WOOCOMMERCE_TIMEOUT, // Configurable timeout (default 30s)
  headers: {
    'Content-Type': 'application/json',
  },
  // Ensure cookies are sent with requests (for session management)
  withCredentials: true,
});

// Some hosts disable Basic Auth for the REST API. Ensure keys are also sent as query params.
// WooCommerce accepts consumer_key/consumer_secret in the query string.
wcAPI.defaults.params = {
  ...(wcAPI.defaults.params || {}),
  consumer_key: CONSUMER_KEY || '',
  consumer_secret: CONSUMER_SECRET || '',
};

// Add request interceptor for WooCommerce session and performance tracking (server-side only)
if (typeof window === 'undefined') {
  try {
    const { fetchMonitor } = require('./monitoring/fetch-instrumentation');
    
    wcAPI.interceptors.request.use(
      async (config) => {
        // Store start time in config metadata
        (config as any).__startTime = Date.now();
        
        // Add WooCommerce session header if available
        try {
          const { getWCSessionHeaders } = await import('./woocommerce-session');
          const sessionHeaders = await getWCSessionHeaders();
          if (sessionHeaders['X-WC-Session']) {
            if (!config.headers) {
              config.headers = {} as AxiosRequestHeaders;
            }
            config.headers['X-WC-Session'] = sessionHeaders['X-WC-Session'];
          }
        } catch (sessionError) {
          // Silently fail if session not available
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Performance tracking response interceptor (runs first)
    wcAPI.interceptors.response.use(
      (response) => {
        const config = response.config as any;
        if (config.__startTime) {
          const duration = Date.now() - config.__startTime;
          const url = `${wcAPI.defaults.baseURL}${config.url || ''}`;
          fetchMonitor.track(
            url,
            config.method?.toUpperCase() || 'GET',
            duration,
            response.status,
            config.__route,
            false,
            undefined
          );
        }
        return response;
      },
      (error: unknown) => {
        const normalized = normalizeError(error);
        
        if (hasAxiosResponse(error)) {
          const details = getAxiosErrorDetails(error);
          const config = error.config as { __startTime?: number; url?: string; method?: string; __route?: string };
          
          if (config?.__startTime) {
            const duration = Date.now() - config.__startTime;
            const url = `${wcAPI.defaults.baseURL}${details.url || ''}`;
            fetchMonitor.track(
              url,
              details.method?.toUpperCase() || 'GET',
              duration,
              normalized.status,
              config.__route,
              false,
              normalized.message
            );
          }
        }
        
        return Promise.reject(error); // Continue to error handler
      }
    );
  } catch (error) {
    // Silently fail if monitoring not available
    if (process.env.NODE_ENV === 'development') {
      console.warn('Performance monitoring not available:', error);
    }
  }
}

// Add response interceptor for better error handling (runs after performance tracking)
wcAPI.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeError(error);
    // Log API errors for debugging
    if (hasAxiosResponse(error)) {
      const details = getAxiosErrorDetails(error);
      const status = details.status;
      const data = details.data; // Remove the type assertion to keep it as unknown
      const url = details.url || 'Unknown URL';
      
      if (status === 401 || status === 403) {
        console.error('WooCommerce API Authentication Error:', {
          status,
          message: (data && typeof data === 'object' && 'message' in data ? data.message : undefined) || 'Invalid API credentials',
          code: (data && typeof data === 'object' && 'code' in data ? data.code : undefined),
          url,
        });
      } else if (status === 500) {
        // Check if it's a known backend issue (Redis, etc.)
        const errorMessage = (data && typeof data === 'object' && 'message' in data ? data.message : undefined) || getErrorMessage(error) || '';
        const isKnownBackendIssue = 
          typeof errorMessage === 'string' && (
            errorMessage.includes('Redis') || 
            errorMessage.includes('object-cache') ||
            errorMessage.includes('wp_die')
          );
        
        if (isKnownBackendIssue) {
          // Only log in development - these are handled gracefully
          if (process.env.NODE_ENV === 'development') {
            console.warn('WooCommerce Backend Issue (handled gracefully):', {
              status,
              message: typeof errorMessage === 'string' ? errorMessage.substring(0, 150) : 'Backend configuration issue',
              url,
              code: (data && typeof data === 'object' && 'code' in data ? data.code : undefined),
            });
          }
          // Still reject the promise so fetchProducts can handle it
          return Promise.reject(error);
        }
        
        // Log full details for unknown 500 errors
        const errorDetails: Record<string, any> = {
          status: status || 'Unknown',
          statusText: details.statusText || 'Internal Server Error',
          url: url,
          message: (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : undefined) || getErrorMessage(error) || 'Internal server error',
        };
        
        // Add code if available
        if (data && typeof data === 'object' && 'code' in data) {
          errorDetails.code = data.code;
        }
        
        // Add params if available
        if (error.config?.params && Object.keys(error.config.params).length > 0) {
          errorDetails.params = error.config.params;
        }
        
        // Handle response data - check if it's actually empty
        if (data !== undefined && data !== null) {
          if (typeof data === 'string' && data.trim().length > 0) {
            errorDetails.responseBody = data;
          } else if (typeof data === 'object') {
            const dataKeys = Object.keys(data);
            if (dataKeys.length > 0) {
              errorDetails.responseData = data;
            } else {
              // Empty object - don't add it, just note it
              errorDetails.note = 'Server returned empty object response';
            }
          } else if (data !== '') {
            errorDetails.responseData = String(data);
          }
        }
        
        // Always log - we guarantee at least status, statusText, url, and message
        console.error('WooCommerce API Server Error:', JSON.stringify(errorDetails, null, 2));
      } else {
        // 404 rest_no_route = route not registered (e.g. product reviews disabled) – warn only, callers fall back
        const code = data && typeof data === 'object' && 'code' in data ? (data as { code?: string }).code : undefined;
        if (status === 404 && code === 'rest_no_route') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('WooCommerce API route not found (fallback may be used):', url);
          }
          return Promise.reject(error);
        }
        // Log other errors - always include basic fields
        const errorInfo: Record<string, any> = {
          status: normalized.status || 'Unknown',
          statusText: details.statusText || 'Error',
          url: url,
          message: normalized.message || `HTTP ${normalized.status} error`,
        };
        if (code !== undefined) {
          errorInfo.code = code;
        }
        // Handle response data
        if (data !== undefined && data !== null) {
          if (typeof data === 'string' && data.trim().length > 0) {
            errorInfo.responseBody = data;
          } else if (typeof data === 'object' && Object.keys(data).length > 0) {
            errorInfo.responseData = data;
          } else if (typeof data === 'object' && Object.keys(data).length === 0) {
            errorInfo.note = 'Server returned empty object response';
          }
        }
        console.error('WooCommerce API Error:', JSON.stringify(errorInfo, null, 2));
      }
    } else if (hasAxiosResponse(error)) {
      // Request was made but no response received
      const isTimeout = isTimeoutError(error) || 
                        (hasAxiosResponse(error) && 
                         ['ECONNABORTED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(getAxiosErrorDetails(error).code || ''));
      
      // Only log non-timeout network errors in development mode
      if (process.env.NODE_ENV === 'development' && !isTimeout) {
        const errorInfo: Record<string, any> = {
          message: getErrorMessage(error) || 'No response from server',
          url: error.config?.url || 'Unknown URL',
        };
        
        // Only add additional info if available
        if (error.code) {
          errorInfo.code = error.code;
        }
        if (error.config?.method) {
          errorInfo.method = error.config.method;
        }
        
        // Only log if we have meaningful information
        if (errorInfo.message && errorInfo.url) {
          console.warn('WooCommerce API Network Error (handled gracefully):', errorInfo);
        }
      }
      // Timeout errors are silently handled - components will show empty states
    } else {
      // Error setting up the request
      console.error('WooCommerce API Request Setup Error:', getErrorMessage(error) || 'Unknown error');
    }
    return Promise.reject(error);
  }
);

export interface WooCommerceProduct {
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
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  on_sale: boolean;
  status: string;
  featured: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: string;
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  backorders: string;
  backorders_allowed: boolean;
  backordered: boolean;
  sold_individually: boolean;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  images: Array<{
    id: number;
    src: string;
    name: string;
    alt: string;
  }>;
  attributes: any[];
  default_attributes: any[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  meta_data: any[];
}

export interface WooCommerceVariationAttribute {
  id?: number;
  name: string; // e.g., 'Color'
  option: string; // e.g., 'Red'
}

export interface WooCommerceVariation {
  id: number;
  sku: string | null;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  tax_status?: string;
  tax_class?: string;
  image?: { id: number; src: string; name: string; alt: string } | null;
  attributes: WooCommerceVariationAttribute[];
  stock_status: string;
}

// NEW: Paginated response interface
export interface PaginatedProductResponse {
  products: WooCommerceProduct[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

/** Get all product IDs for a single brand term from WP REST API (paginated). */
async function getProductIdsByBrandTerm(
  base: string,
  taxonomyUsed: string,
  termId: number,
  maxIds: number = 5000
): Promise<number[]> {
  const ids: number[] = [];
  let wpPage = 1;
  const perPage = 100;
  while (ids.length < maxIds) {
    const res = await fetch(
      `${base}/wp-json/wp/v2/product?${taxonomyUsed}=${termId}&per_page=${perPage}&page=${wpPage}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) break;
    const posts: any[] = await res.json();
    const pageIds = Array.isArray(posts) ? posts.map((p: any) => p.id).filter((id: any) => id != null) : [];
    if (pageIds.length === 0) break;
    ids.push(...pageIds);
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    if (wpPage >= totalPages) break;
    wpPage += 1;
  }
  return ids;
}

/** Resolve brand slug to taxonomy name and term ID via WP REST API. */
async function resolveBrandSlugToTerm(
  base: string,
  brandSlug: string
): Promise<{ taxonomyUsed: string; termId: number } | null> {
  const slugEnc = encodeURIComponent(brandSlug.toLowerCase().trim());
  const taxonomyEndpoints = ['product_brand', 'pa_brand', 'brand'];
  for (const tax of taxonomyEndpoints) {
    try {
      const res = await fetch(
        `${base}/wp-json/wp/v2/${tax}?slug=${slugEnc}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const term = Array.isArray(data) ? data[0] : data;
      if (term && term.id != null) return { taxonomyUsed: tax, termId: Number(term.id) };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch products by Brands taxonomy (WooCommerce → Products → Brands).
 * Single brand; used when "Brands" is a taxonomy.
 */
async function fetchProductsByBrandTaxonomy(
  brandSlug: string,
  page: number,
  perPage: number,
  categoryId?: number,
  sortBy?: string
): Promise<PaginatedProductResponse> {
  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
  if (!base) return { products: [], total: 0, totalPages: 0, page, perPage };

  const resolved = await resolveBrandSlugToTerm(base, brandSlug);
  if (!resolved) return { products: [], total: 0, totalPages: 0, page, perPage };

  const { taxonomyUsed, termId } = resolved;
  const allIds = await getProductIdsByBrandTerm(base, taxonomyUsed, termId);
  if (allIds.length === 0) return { products: [], total: 0, totalPages: 0, page, perPage };

  let filteredIds = allIds;
  if (categoryId != null) {
    const inCategory: number[] = [];
    let wcPage = 1;
    const wcPerPage = 100;
    while (true) {
      const wcRes = await wcAPI.get('/products', {
        params: { category: categoryId, per_page: wcPerPage, page: wcPage },
      });
      const products: any[] = wcRes.data || [];
      if (products.length === 0) break;
      const idSet = new Set(allIds);
      products.forEach((p: any) => { if (p.id != null && idSet.has(p.id)) inCategory.push(p.id); });
      if (products.length < wcPerPage) break;
      wcPage += 1;
    }
    filteredIds = inCategory;
  }

  const total = filteredIds.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const pageIds = filteredIds.slice(start, start + perPage);
  if (pageIds.length === 0) return { products: [], total, totalPages, page, perPage };

  const wcRes = await wcAPI.get('/products', {
    params: { include: pageIds.join(','), per_page: pageIds.length },
  });
  let products: any[] = wcRes.data || [];
  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  let sorted = [...products].sort(
    (a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );

  // Apply in-page sorting for brand taxonomy results
  if (sortBy) {
    sorted = applySortBy(sorted, sortBy);
  }

  return { products: sorted, total, totalPages, page, perPage };
}

/**
 * Fetch products by multiple brands (taxonomy) and optional category.
 * Products in (brand1 OR brand2 OR ...) AND (category if set).
 */
async function fetchProductsByBrandTaxonomyMulti(
  brandSlugs: string[],
  categoryId: number | undefined,
  page: number,
  perPage: number,
  sortBy?: string
): Promise<PaginatedProductResponse> {
  const base = process.env.NEXT_PUBLIC_WP_URL || getWpBaseUrl();
  if (!base) return { products: [], total: 0, totalPages: 0, page, perPage };

  const slugSet = new Set(brandSlugs.map((s) => s.toLowerCase().trim()).filter(Boolean));
  if (slugSet.size === 0) return { products: [], total: 0, totalPages: 0, page, perPage };

  const allIds = new Set<number>();
  for (const slug of slugSet) {
    const resolved = await resolveBrandSlugToTerm(base, slug);
    if (!resolved) continue;
    const ids = await getProductIdsByBrandTerm(base, resolved.taxonomyUsed, resolved.termId);
    ids.forEach((id) => allIds.add(id));
  }
  let filteredIds = Array.from(allIds);
  if (categoryId != null) {
    const inCategory: number[] = [];
    let wcPage = 1;
    const wcPerPage = 100;
    const idSet = new Set(filteredIds);
    while (true) {
      const wcRes = await wcAPI.get('/products', {
        params: { category: categoryId, per_page: wcPerPage, page: wcPage },
      });
      const products: any[] = wcRes.data || [];
      if (products.length === 0) break;
      products.forEach((p: any) => { if (p.id != null && idSet.has(p.id)) inCategory.push(p.id); });
      if (products.length < wcPerPage) break;
      wcPage += 1;
    }
    filteredIds = inCategory;
  }

  const total = filteredIds.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const pageIds = filteredIds.slice(start, start + perPage);
  if (pageIds.length === 0) return { products: [], total, totalPages, page, perPage };

  const wcRes = await wcAPI.get('/products', {
    params: { include: pageIds.join(','), per_page: pageIds.length },
  });
  let products: any[] = wcRes.data || [];
  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  let sorted = [...products].sort(
    (a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  );

  // Apply in-page sorting for multi-brand taxonomy results
  if (sortBy) {
    sorted = applySortBy(sorted, sortBy);
  }

  return { products: sorted, total, totalPages, page, perPage };
}

// UPDATED: Fetch all products with pagination support
export const fetchProducts = async (params?: {
  per_page?: number;
  page?: number;
  orderby?: string;
  order?: string;
  category?: string | number;
  search?: string;
  featured?: boolean;
  categorySlug?: string;
  categories?: string;
  brands?: string;
  tags?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  include?: number[];
  on_sale?: boolean;  // Fetch specific product IDs
}): Promise<PaginatedProductResponse> => {
  try {
    // Clean up params
    const cleanParams: any = {};
    
    // Basic pagination
    if (params?.per_page !== undefined && params.per_page > 0) {
      cleanParams.per_page = params.per_page;
    } else {
      cleanParams.per_page = 24; // Default
    }
    
    if (params?.page !== undefined && params.page > 0) {
      cleanParams.page = params.page;
    } else {
      cleanParams.page = 1; // Default
    }
    
    // Handle sortBy mapping
    if (params?.sortBy) {
      switch (params.sortBy) {
        case 'price_low':
          cleanParams.orderby = 'price';
          cleanParams.order = 'asc';
          break;
        case 'price_high':
          cleanParams.orderby = 'price';
          cleanParams.order = 'desc';
          break;
        case 'newest':
          cleanParams.orderby = 'date';
          cleanParams.order = 'desc';
          break;
        case 'rating':
          cleanParams.orderby = 'rating';
          cleanParams.order = 'desc';
          break;
        case 'popularity':
          cleanParams.orderby = 'popularity';
          cleanParams.order = 'desc';
          break;
        default:
          cleanParams.orderby = 'menu_order';
          cleanParams.order = 'asc';
      }
    } else {
      // Validate and set orderby/order if provided directly
      const validOrderBy = ['date', 'id', 'include', 'title', 'slug', 'price', 'popularity', 'rating', 'menu_order'];
      if (params?.orderby && validOrderBy.includes(params.orderby)) {
        cleanParams.orderby = params.orderby;
      }
      
      if (params?.order && ['asc', 'desc'].includes(params.order.toLowerCase())) {
        cleanParams.order = params.order.toLowerCase();
      }
    }
    
    // Helper to resolve category slug to ID
    const resolveCategorySlug = async (slug: string): Promise<number | null> => {
      try {
        const response = await wcAPI.get('/products/categories', { params: { slug } });
        const categories = response.data;
        if (categories?.length) {
          console.log(`🏷️ Resolved category slug "${slug}" → ID ${categories[0].id}`);
          return categories[0].id;
        }
        console.warn(`⚠️ Category slug "${slug}" not found`);
        return null;
      } catch (error: unknown) {
        const normalized = normalizeError(error);
        console.warn(`⚠️ Failed to resolve category slug "${slug}":`, normalized.message);
        return null;
      }
    };
    
    // Handle category filtering - resolve slug to ID if needed
    let categoryId: number | undefined;
    
    if (params?.category !== undefined && params.category !== '' && params.category !== null) {
      // Direct category ID or slug provided
      const catVal = String(params.category);
      const parsed = parseInt(catVal, 10);
      if (!isNaN(parsed)) {
        categoryId = parsed;
      } else {
        // It's a slug, resolve to ID
        const resolved = await resolveCategorySlug(catVal);
        if (resolved) categoryId = resolved;
      }
    } else if (params?.categorySlug) {
      // Category slug provided, must resolve to ID
      const resolved = await resolveCategorySlug(params.categorySlug);
      if (resolved) categoryId = resolved;
    } else if (params?.categories) {
      // Multiple categories - check if it's IDs or slugs
      const catVal = String(params.categories);
      const parsed = parseInt(catVal, 10);
      if (!isNaN(parsed)) {
        categoryId = parsed;
      } else {
        const resolved = await resolveCategorySlug(catVal);
        if (resolved) categoryId = resolved;
      }
    }
    
    if (categoryId !== undefined) {
      cleanParams.category = categoryId;
    }
    
    // WooCommerce REST API expects attribute + attribute_term (term ID) – see WC_REST_Products_Controller prepare_objects_query
    const resolveBrandToAttributeAndTermId = async (
      slug: string
    ): Promise<{ attribute: string; attribute_term: number } | null> => {
      const slugTrim = String(slug).trim().toLowerCase();
      const slugNorm = slugTrim.replace(/\s+/g, '-');
      const asNum = parseInt(slugTrim, 10);
      const isNumericId = !isNaN(asNum) && String(asNum) === slugTrim;

      const matchBrandAttr = (a: any) => {
        const s = (a.slug || '').toLowerCase();
        const n = (a.name || '').toLowerCase();
        return (
          s === 'product_brand' ||
          s === 'brand' ||
          s === 'brands' ||
          s === 'product_brands' ||
          n === 'brand' ||
          n === 'brands'
        );
      };

      try {
        const attrRes = await wcAPI.get('/products/attributes');
        const attributes = Array.isArray(attrRes.data) ? attrRes.data : [];
        const brandAttr = attributes.find(matchBrandAttr);
        if (!brandAttr) return null;

        const attributeTaxonomy = brandAttr.slug ? `pa_${brandAttr.slug}` : 'pa_brand';

        if (isNumericId) {
          return { attribute: attributeTaxonomy, attribute_term: asNum };
        }

        // Fetch terms (no slug filter – API may not support it; fetch more and find by slug)
        const termsRes = await wcAPI.get(`/products/attributes/${brandAttr.id}/terms`, {
          params: { per_page: 250, orderby: 'name', order: 'asc' },
        });
        const terms = Array.isArray(termsRes.data) ? termsRes.data : [];
        const term = terms.find(
          (t: any) =>
            (t.slug || '').toLowerCase() === slugNorm ||
            (t.slug || '').toLowerCase() === slugTrim ||
            (t.name || '').toLowerCase() === slugTrim.replace(/-/g, ' ')
        );
        if (!term || term.id == null) return null;
        return { attribute: attributeTaxonomy, attribute_term: Number(term.id) };
      } catch {
        return null;
      }
    };

    let singleBrandSlugForFallback: string | null = null;
    let requestedBrandSlugs: string[] = [];

    // Handle brand filtering – try product attribute first; if "Brands" is a taxonomy, use WP REST API (supports multi-brand, category, and sort)
    if (params?.brands && params.brands !== '') {
      const brandVal = String(params.brands).trim();
      const brandSlugs = brandVal.split(',').map((s) => s.trim()).filter(Boolean);
      requestedBrandSlugs = brandSlugs.map((s) => s.toLowerCase());
      const firstSlug = brandSlugs[0];
      if (!firstSlug) {
        // no-op
      } else if (brandSlugs.length === 1) {
        const resolved = await resolveBrandToAttributeAndTermId(firstSlug);
        if (resolved) {
          cleanParams.attribute = resolved.attribute;
          cleanParams.attribute_term = resolved.attribute_term;
          singleBrandSlugForFallback = firstSlug;
        } else {
          const pageNum = cleanParams.page || 1;
          const perPageNum = cleanParams.per_page || 24;
          return fetchProductsByBrandTaxonomy(firstSlug, pageNum, perPageNum, categoryId, params.sortBy);
        }
      } else {
        // Multiple brands – use taxonomy path (attribute path only supports single term)
        const pageNum = cleanParams.page || 1;
        const perPageNum = cleanParams.per_page || 24;
        return fetchProductsByBrandTaxonomyMulti(brandSlugs, categoryId, pageNum, perPageNum, params.sortBy);
      }
    }
    
    // Handle tags
    if (params?.tags) {
      cleanParams.tag = params.tags;
    }
    
    // Handle price range
    if (params?.minPrice) {
      cleanParams.min_price = params.minPrice;
    }
    if (params?.maxPrice) {
      cleanParams.max_price = params.maxPrice;
    }
    
    // Handle search
    if (params?.search && params.search.trim()) {
      cleanParams.search = params.search.trim();
    }
    
    // Convert boolean to 1/0 for WooCommerce API
    if (params?.featured !== undefined) {
      cleanParams.featured = params.featured ? 1 : 0;
    }
    if (params?.on_sale === true) {
      cleanParams.on_sale = true;
    }

    // Handle include parameter (fetch specific product IDs)
    if (params?.include && params.include.length > 0) {
      cleanParams.include = params.include.join(',');
      // When fetching specific IDs, ensure we get all of them
      cleanParams.per_page = Math.max(cleanParams.per_page || 24, params.include.length);
    }
    
    console.log('🛒 WooCommerce Request:', {
      endpoint: '/products',
      params: cleanParams,
    });
    
    const response = await wcAPI.get('/products', { params: cleanParams });
    
    // Extract pagination data from headers
    const total = parseInt(response.headers['x-wp-total'] || '0', 10);
    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
    
    console.log('✅ WooCommerce Response:', {
      productsCount: response.data?.length || 0,
      total,
      totalPages,
      page: cleanParams.page,
    });

    // Some stores expose brands via taxonomy, not as attribute terms for combined filters.
    // If single-brand attribute filtering returns nothing, retry with taxonomy fallback.
    if (
      singleBrandSlugForFallback &&
      (response.data?.length || 0) === 0 &&
      Number(total) === 0
    ) {
      const pageNum = cleanParams.page || 1;
      const perPageNum = cleanParams.per_page || 24;
      return fetchProductsByBrandTaxonomy(
        singleBrandSlugForFallback,
        pageNum,
        perPageNum,
        categoryId,
        params?.sortBy
      );
    }

    // Final fallback for category+brand combinations:
    // Some stores have brand data in custom/meta shapes that don't match WC attribute/taxonomy filtering.
    // In that case, load category products and filter by extracted brand slug/name in-memory.
    if (
      categoryId != null &&
      requestedBrandSlugs.length > 0 &&
      (response.data?.length || 0) === 0 &&
      Number(total) === 0
    ) {
      const normalize = (v: string) => v.toLowerCase().trim().replace(/\s+/g, '-');
      const wanted = new Set(requestedBrandSlugs.map(normalize));
      const allCategoryProducts: WooCommerceProduct[] = [];
      let rescuePage = 1;
      const rescuePerPage = 100;
      const rescueMaxPages = 10;

      while (rescuePage <= rescueMaxPages) {
        const rescueRes = await wcAPI.get('/products', {
          params: {
            category: categoryId,
            per_page: rescuePerPage,
            page: rescuePage,
          },
        });

        const items: WooCommerceProduct[] = Array.isArray(rescueRes.data) ? rescueRes.data : [];
        if (items.length === 0) break;
        allCategoryProducts.push(...items);
        if (items.length < rescuePerPage) break;
        rescuePage += 1;
      }

      const matched = allCategoryProducts.filter((product) => {
        const brands = extractProductBrands(product);
        return brands.some((b) => {
          const slug = b.slug ? normalize(b.slug) : '';
          const name = b.name ? normalize(b.name) : '';
          return (slug && wanted.has(slug)) || (name && wanted.has(name));
        });
      });

      if (matched.length > 0) {
        let sortedMatched = matched;
        if (params?.sortBy) {
          sortedMatched = applySortBy(sortedMatched, params.sortBy);
        }

        const pageNum = cleanParams.page || 1;
        const perPageNum = cleanParams.per_page || 24;
        const start = (pageNum - 1) * perPageNum;
        const paged = sortedMatched.slice(start, start + perPageNum);

        return {
          products: paged,
          total: sortedMatched.length,
          totalPages: Math.max(1, Math.ceil(sortedMatched.length / perPageNum)),
          page: pageNum,
          perPage: perPageNum,
        };
      }
    }
    
    return {
      products: response.data || [],
      total,
      totalPages,
      page: cleanParams.page,
      perPage: cleanParams.per_page,
    };
  } catch (error: unknown) {
    const normalized = normalizeError(error);
    if (isTimeoutError(error)) {
      throw new Error('GraphQL request timeout');
    }
    throw error;
  }
};

/**
 * Apply client-side sorting for brand taxonomy helpers based on sortBy value.
 */
function applySortBy(products: any[], sortBy: string): any[] {
  const sorted = [...products];
  switch (sortBy) {
    case 'price_low':
      return sorted.sort((a, b) => parseFloat(a.price || '0') - parseFloat(b.price || '0'));
    case 'price_high':
      return sorted.sort((a, b) => parseFloat(b.price || '0') - parseFloat(a.price || '0'));
    case 'newest':
      return sorted.sort(
        (a, b) => new Date(b.date_created || b.date_created_gmt || 0).getTime() -
                  new Date(a.date_created || a.date_created_gmt || 0).getTime()
      );
    case 'rating':
      return sorted.sort(
        (a, b) => parseFloat(b.average_rating || '0') - parseFloat(a.average_rating || '0')
      );
    case 'popularity':
      // Use rating_count as a proxy for popularity when total_sales isn't available
      return sorted.sort((a, b) => (b.rating_count || 0) - (a.rating_count || 0));
    default:
      return sorted;
  }
}

// Fetch a single product by ID
export const fetchProduct = async (id: number): Promise<WooCommerceProduct> => {
  try {
    const response = await wcAPI.get(`/products/${id}`);
    return response.data;
  } catch (error: unknown) {
    console.error('Error fetching product:', getErrorMessage(error));
    throw error;
  }
};

// Fetch a single product by slug
export const fetchProductBySlug = async (slug: string): Promise<WooCommerceProduct | null> => {
  // Validate slug input
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    return null;
  }

  try {
    const response = await wcAPI.get('/products', { params: { slug: slug.trim() } });
    const products: WooCommerceProduct[] = response.data;
    
    if (!Array.isArray(products)) {
      return null;
    }
    
    return products.length > 0 ? products[0] : null;
  } catch (error: unknown) {
    // Check for timeout/network errors (expected, handle gracefully)
    const isTimeout = isTimeoutError(error) || 
      (hasAxiosResponse(error) && 
       ['ECONNABORTED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(getAxiosErrorDetails(error).code || ''));
    
    // Only log non-timeout errors in development
    if (process.env.NODE_ENV === 'development' && !isTimeout) {
      const message = getErrorMessage(error);
      const status = hasAxiosResponse(error) ? getAxiosErrorDetails(error).status : undefined;
      console.warn(`[fetchProductBySlug] Failed for "${slug}":`, { message, status });
    }
    
    return null;
  }
};

// Fetch products by category
export const fetchProductsByCategory = async (categoryId: number): Promise<WooCommerceProduct[]> => {
  try {
    const response = await wcAPI.get('/products', {
      params: { category: categoryId },
    });
    return response.data;
  } catch (error: unknown) {
    console.error('Error fetching products by category:', getErrorMessage(error));
    throw error;
  }
};

// Fetch variations for a variable product
export const fetchProductVariations = async (
  productId: number,
  params?: { per_page?: number; page?: number }
): Promise<WooCommerceVariation[]> => {
  try {
    const response = await wcAPI.get(`/products/${productId}/variations`, { params });
    return response.data;
  } catch (error: unknown) {
    console.error('Error fetching product variations:', getErrorMessage(error));
    throw error;
  }
};

export interface WooCommerceProductReview {
  id: number;
  date_created: string;
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
}

// Fetch product reviews. WooCommerce uses GET /products/reviews?product=ID (not /products/ID/reviews).
export const fetchProductReviews = async (
  productId: number,
  params?: { per_page?: number; page?: number }
): Promise<WooCommerceProductReview[]> => {
  const perPage = params?.per_page ?? 10;
  const page = params?.page ?? 1;
  try {
    const response = await wcAPI.get('/products/reviews', {
      params: { product: productId, per_page: perPage, page },
    });
    const data = response.data ?? [];
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    const custom = await fetchProductReviewsCustomEndpoint(productId, { per_page: perPage, page });
    return custom.length > 0 ? custom : data;
  } catch (error: unknown) {
    const isNoRoute =
      hasAxiosResponse(error) &&
      typeof getAxiosErrorDetails(error).data === 'object' &&
      getAxiosErrorDetails(error).data !== null &&
      'message' in (getAxiosErrorDetails(error).data as object) &&
      String((getAxiosErrorDetails(error).data as { message?: string }).message || '').includes('No route was found');
    const isTimeout = isTimeoutError(error) || (hasAxiosResponse(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(getAxiosErrorDetails(error).code || ''));
    if (isNoRoute || isTimeout) {
      const custom = await fetchProductReviewsCustomEndpoint(productId, { per_page: perPage, page });
      return custom;
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('Error fetching product reviews:', getErrorMessage(error));
    }
    const custom = await fetchProductReviewsCustomEndpoint(productId, { per_page: perPage, page });
    return custom;
  }
};

async function fetchProductReviewsCustomEndpoint(
  productId: number,
  params: { per_page: number; page: number }
): Promise<WooCommerceProductReview[]> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return [];
  const url = `${wpBase}/wp-json/custom/v1/products/${productId}/reviews?per_page=${params.per_page}&page=${params.page}`;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? (body as WooCommerceProductReview[]) : [];
  } catch {
    return [];
  }
}

// Create a product review. Tries WooCommerce first; if "No route" (wc/v3 not exposed), uses custom WordPress endpoint.
export const createProductReview = async (
  productId: number,
  data: { reviewer: string; reviewer_email: string; review: string; rating: number }
): Promise<{ created: WooCommerceProductReview | null; error?: string }> => {
  try {
    const response = await wcAPI.post('/products/reviews', {
      product_id: productId,
      ...data,
    });
    return { created: response.data };
  } catch (wcError: unknown) {
    let message = getErrorMessage(wcError);
    if (hasAxiosResponse(wcError)) {
      const details = getAxiosErrorDetails(wcError);
      const errData = details.data;
      if (errData && typeof errData === 'object' && 'message' in errData && typeof (errData as { message: string }).message === 'string') {
        message = (errData as { message: string }).message;
      }
    }
    const isNoRoute = typeof message === 'string' && (message.includes('No route was found') || message.includes('rest_no_route'));
    if (isNoRoute) {
      const custom = await createProductReviewCustomEndpoint(productId, data);
      if (custom.created) return { created: custom.created };
      if (custom.error) return { created: null, error: custom.error };
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('Error creating product review:', message);
    }
    return { created: null, error: message };
  }
};

/** Call custom WordPress REST endpoint when WooCommerce wc/v3 product reviews route is not registered. */
async function createProductReviewCustomEndpoint(
  productId: number,
  data: { reviewer: string; reviewer_email: string; review: string; rating: number }
): Promise<{ created: WooCommerceProductReview | null; error?: string }> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return { created: null, error: 'WordPress URL not configured.' };
  const url = `${wpBase}/wp-json/custom/v1/products/${productId}/reviews`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body && typeof body === 'object' && 'message' in body && typeof (body as { message: string }).message === 'string')
        ? (body as { message: string }).message
        : res.statusText || 'Failed to submit review.';
      return { created: null, error: msg };
    }
    const created = body as WooCommerceProductReview;
    if (created && (created.id != null || created.review != null)) {
      return { created };
    }
    return { created: null, error: 'Invalid response from review endpoint.' };
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if (process.env.NODE_ENV === 'development') {
      console.warn('Custom review endpoint failed:', msg);
    }
    return { created: null, error: msg };
  }
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
  description?: string;
}

// Header Navbar Categories and subcategories
export const fetchCategories = async (
  params?: { per_page?: number; parent?: number; hide_empty?: boolean }
): Promise<WooCommerceCategory[]> => {
  try {
    let page = 1;
    let all: WooCommerceCategory[] = [];

    while (true) {
      const response = await wcAPI.get('/products/categories', {
        params: {
          ...params,
          per_page: 100,
          page,
        },
      });

      const data = response.data || [];

      if (!data.length) break;

      all = [...all, ...data];

      // Stop if last page
      if (data.length < 100) break;

      page++;
    }

    return all;
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development' && hasAxiosResponse(error)) {
      const details = getAxiosErrorDetails(error);
      console.warn('Error fetching categories:', {
        status: details.status,
        url: details.url,
      });
    }

    return [];
  }
};

export const fetchCategoryBySlug = async (slug: string): Promise<WooCommerceCategory | null> => {
  try {
    const response = await wcAPI.get('/products/categories', { params: { slug } });
    const categories: WooCommerceCategory[] = response.data;
    return categories.length ? categories[0] : null;
  } catch (error: unknown) {
    // Timeout errors are expected in some scenarios and handled gracefully
    // Components handle null returns gracefully
    // Suppress all timeout-related errors to reduce console noise
    const isTimeout = isTimeoutError(error) || 
                          (hasAxiosResponse(error) && 
                           ['ECONNABORTED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(getAxiosErrorDetails(error).code || ''));
    
    // Don't log timeout errors - they're handled gracefully
    // Only log other network errors in development mode
    if (process.env.NODE_ENV === 'development' && !hasAxiosResponse(error) && !isTimeout) {
      console.warn(`Network error fetching category by slug "${slug}" (handled gracefully)`);
    }
    // Timeout errors are silently handled - return null gracefully
    // Return null instead of throwing to prevent breaking the UI
    return null;
  }
};

export default wcAPI;