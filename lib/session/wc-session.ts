/**
 * WooCommerce Session Management
 * Handles WooCommerce cart and customer sessions
 */

import {
  SessionData,
  SessionType,
  SessionStatus,
  CartSession,
  SessionCustomer,
  SessionErrorCode,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  createSession,
  updateSession,
  generateSessionId,
  cacheSession,
  getCachedSession,
  createSessionError,
} from './manager';
import { secureFetch } from './secure-fetch';
import { getWpBaseUrl } from '../wp-utils';
import { getErrorMessage } from '@/lib/utils/errors';

/**
 * WooCommerce session storage key
 */
const WC_SESSION_KEY = 'wc_session_hash';

/**
 * WooCommerce API endpoints
 */
const WC_ENDPOINTS = {
  cart: '/wp-json/wc/store/v1/cart',
  customer: '/wp-json/wc/v3/customers',
  session: '/wp-json/wc/store/v1/cart/customer',
};

/**
 * Create a new WooCommerce cart session
 */
export async function createWcSession(
  authSession?: SessionData
): Promise<SessionData> {
  const wpBase = getWpBaseUrl();
  
  // Create guest session if no auth
  if (!authSession?.token) {
    return createSession(SessionType.GUEST, {
      cart: {
        cartKey: generateSessionId(),
        cartHash: '',
        itemCount: 0,
        lastUpdated: Date.now(),
      },
    });
  }
  
  // Try to get existing cart for authenticated user
  try {
    const result = await secureFetch<{
      items: unknown[];
      totals: { total_items: number };
      extensions?: { session_hash?: string };
    }>(
      `${wpBase}${WC_ENDPOINTS.cart}`,
      authSession,
      {
        timeout: DEFAULT_SESSION_CONFIG.networkTimeout,
        retries: 2,
      }
    );
    
    if (result.data) {
      const cartData: CartSession = {
        cartKey: result.data.extensions?.session_hash || generateSessionId(),
        cartHash: '',
        itemCount: result.data.totals?.total_items || result.data.items?.length || 0,
        lastUpdated: Date.now(),
      };
      
      return updateSession(authSession, {
        cart: cartData,
      });
    }
  } catch (error: unknown) {
    // Log but continue with empty cart
    if (process.env.NODE_ENV === 'development') {
      console.debug('Failed to fetch existing cart:', getErrorMessage(error));
    }
  }
  
  // Return auth session with empty cart
  return updateSession(authSession, {
    cart: {
      cartKey: generateSessionId(),
      cartHash: '',
      itemCount: 0,
      lastUpdated: Date.now(),
    },
  });
}

/**
 * Sync cart with WooCommerce
 */
export async function syncWcCart(session: SessionData): Promise<SessionData> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return session;
  }
  
  try {
    const result = await secureFetch<{
      items: unknown[];
      totals: { total_items: number };
      extensions?: { session_hash?: string };
    }>(
      `${wpBase}${WC_ENDPOINTS.cart}`,
      session,
      {
        includeCart: true,
        timeout: DEFAULT_SESSION_CONFIG.networkTimeout,
      }
    );
    
    if (result.data) {
      return updateSession(session, {
        cart: {
          ...session.cart,
          cartKey: result.data.extensions?.session_hash || session.cart?.cartKey || generateSessionId(),
          itemCount: result.data.totals?.total_items || result.data.items?.length || 0,
          lastUpdated: Date.now(),
        },
      });
    }
    
    return session;
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Cart sync failed:', getErrorMessage(error));
    }
    return session;
  }
}

/**
 * Add item to WooCommerce cart
 */
export async function addToWcCart(
  session: SessionData,
  productId: number,
  quantity: number = 1,
  variation?: { id: number; attributes?: Record<string, string> }
): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const body: Record<string, unknown> = {
    id: productId,
    quantity,
  };
  
  if (variation) {
    body.variation = variation.attributes || {};
    body.variation_id = variation.id;
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
    extensions?: { session_hash?: string };
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/add-item`,
    session,
    {
      method: 'POST',
      body: JSON.stringify(body),
      includeCart: true,
      requireAuth: false,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      cartKey: result.data?.extensions?.session_hash || session.cart?.cartKey || generateSessionId(),
      itemCount: result.data?.totals?.total_items || result.data?.items?.length || (session.cart?.itemCount || 0) + quantity,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Remove item from WooCommerce cart
 */
export async function removeFromWcCart(
  session: SessionData,
  itemKey: string
): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
    extensions?: { session_hash?: string };
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/remove-item`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({ key: itemKey }),
      includeCart: true,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      cartKey: result.data?.extensions?.session_hash || session.cart?.cartKey || generateSessionId(),
      itemCount: result.data?.totals?.total_items || result.data?.items?.length || 0,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Update cart item quantity
 */
export async function updateWcCartItem(
  session: SessionData,
  itemKey: string,
  quantity: number
): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
    extensions?: { session_hash?: string };
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/update-item`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({ key: itemKey, quantity }),
      includeCart: true,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      cartKey: result.data?.extensions?.session_hash || session.cart?.cartKey || generateSessionId(),
      itemCount: result.data?.totals?.total_items || result.data?.items?.length || 0,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Clear WooCommerce cart
 */
export async function clearWcCart(session: SessionData): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/items`,
    session,
    {
      method: 'DELETE',
      includeCart: true,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      cartKey: session.cart?.cartKey || generateSessionId(),
      itemCount: 0,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Apply coupon to cart
 */
export async function applyWcCoupon(
  session: SessionData,
  couponCode: string
): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
    coupons: unknown[];
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/apply-coupon`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({ code: couponCode }),
      includeCart: true,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Remove coupon from cart
 */
export async function removeWcCoupon(
  session: SessionData,
  couponCode: string
): Promise<{
  success: boolean;
  session: SessionData;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session,
      error: 'WordPress URL not configured',
    };
  }
  
  const result = await secureFetch<{
    items: unknown[];
    totals: { total_items: number };
    coupons: unknown[];
  }>(
    `${wpBase}${WC_ENDPOINTS.cart}/remove-coupon`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({ code: couponCode }),
      includeCart: true,
    }
  );
  
  if (result.error) {
    return {
      success: false,
      session,
      error: result.error.message,
    };
  }
  
  const updatedSession = updateSession(session, {
    cart: {
      ...session.cart,
      lastUpdated: Date.now(),
    },
  });
  
  return {
    success: true,
    session: updatedSession,
  };
}

/**
 * Get WooCommerce customer data
 */
export async function getWcCustomer(
  session: SessionData
): Promise<SessionCustomer | null> {
  if (!session.user?.email) {
    return null;
  }
  
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return null;
  }
  
  const result = await secureFetch<Array<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    billing: Record<string, string>;
    shipping: Record<string, string>;
  }>>(
    `${wpBase}${WC_ENDPOINTS.customer}?email=${encodeURIComponent(session.user.email)}`,
    session,
    {
      requireAuth: true,
    }
  );
  
  if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
    return null;
  }
  
  const customer = result.data[0];
  
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.first_name,
    lastName: customer.last_name,
    billing: {
      firstName: customer.billing?.first_name,
      lastName: customer.billing?.last_name,
      company: customer.billing?.company,
      address1: customer.billing?.address_1,
      address2: customer.billing?.address_2,
      city: customer.billing?.city,
      state: customer.billing?.state,
      postcode: customer.billing?.postcode,
      country: customer.billing?.country,
      phone: customer.billing?.phone,
      email: customer.billing?.email,
    },
    shipping: {
      firstName: customer.shipping?.first_name,
      lastName: customer.shipping?.last_name,
      company: customer.shipping?.company,
      address1: customer.shipping?.address_1,
      address2: customer.shipping?.address_2,
      city: customer.shipping?.city,
      state: customer.shipping?.state,
      postcode: customer.shipping?.postcode,
      country: customer.shipping?.country,
    },
  };
}

/**
 * Merge guest cart with user cart after login
 */
export async function mergeWcCart(
  guestSession: SessionData,
  authSession: SessionData
): Promise<SessionData> {
  // If no guest cart, just return auth session
  if (!guestSession.cart || guestSession.cart.itemCount === 0) {
    return createWcSession(authSession);
  }
  
  // WooCommerce handles cart merge automatically when
  // the session is transferred. We just need to sync.
  return syncWcCart(authSession);
}

/**
 * Create or restore WooCommerce session from storage
 */
export async function initializeWcSession(
  authSession?: SessionData
): Promise<SessionData> {
  // Check for cached session
  const cached = authSession?.id ? getCachedSession(authSession.id) : null;
  if (cached?.cart) {
    return cached;
  }
  
  // Create new session
  return createWcSession(authSession);
}

