'use server';

/**
 * WooGraphQL Server-Side Authentication
 * 
 * Server-side authentication utilities for Next.js App Router
 * Handles cookies, tokens, and session management
 */

import { cookies } from 'next/headers';
import { 
  graphqlLogin, 
  graphqlRefreshToken, 
  graphqlRegisterUser,
  graphqlGetViewer,
  normalizeGraphQLUser,
  isGraphQLAuthAvailable,
} from './auth';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  authenticateUser,
  createWooUser,
} from '@/lib/auth-server';
import { getWpBaseUrl } from '@/lib/wp-utils';

// ============================================================================
// Constants
// ============================================================================

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const WC_SESSION_COOKIE = 'woocommerce_session';
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// ============================================================================
// Cookie Helpers
// ============================================================================

/**
 * Set refresh token cookie
 */
export async function setRefreshToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  
  cookieStore.set(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: '/',
  });
}

/**
 * Get refresh token from cookie
 */
export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value || null;
}

/**
 * Clear refresh token cookie
 */
export async function clearRefreshToken(): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  
  cookieStore.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Set WooCommerce session token cookie
 */
export async function setWCSessionToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  
  cookieStore.set(WC_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}

/**
 * Get WooCommerce session token from cookie
 */
export async function getWCSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(WC_SESSION_COOKIE)?.value || null;
}

/**
 * Clear WooCommerce session token cookie
 */
export async function clearWCSessionToken(): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  
  cookieStore.set(WC_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 0,
    path: '/',
  });
}

// ============================================================================
// Auth Functions
// ============================================================================

/**
 * Login via GraphQL with fallback to REST
 */
export async function serverLogin(
  username: string,
  password: string
): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  // Try GraphQL first
  if (isGraphQLAuthAvailable()) {
    try {
      const result = await graphqlLogin(username, password);
      
      // Set cookies
      await setAuthToken(result.authToken);
      if (result.refreshToken) {
        await setRefreshToken(result.refreshToken);
      }
      if (result.sessionToken) {
        await setWCSessionToken(result.sessionToken);
      }
      
      return {
        success: true,
        user: normalizeGraphQLUser(result.user),
      };
    } catch (graphqlError: any) {
      console.warn('GraphQL login failed, trying REST:', graphqlError.message);
      // Fall through to REST
    }
  }
  
  // Fallback to REST API
  try {
    const session = await authenticateUser(username, password);
    await setAuthToken(session.token);
    
    return {
      success: true,
      user: session.user,
    };
  } catch (restError: any) {
    return {
      success: false,
      error: restError.message || 'Login failed',
    };
  }
}

/**
 * Register via GraphQL with fallback to REST
 */
export async function serverRegister(input: {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  // Try GraphQL first
  if (isGraphQLAuthAvailable()) {
    try {
      const result = await graphqlRegisterUser(input);
      
      // Auto-login after registration
      const loginResult = await serverLogin(input.username, input.password);
      
      return {
        success: true,
        user: loginResult.user || normalizeGraphQLUser(result.user),
      };
    } catch (graphqlError: any) {
      console.warn('GraphQL registration failed, trying REST:', graphqlError.message);
      // Fall through to REST
    }
  }
  
  // Fallback to REST API
  try {
    const user = await createWooUser(input);
    
    // Auto-login after registration
    const loginResult = await serverLogin(input.email, input.password);
    
    return {
      success: true,
      user: loginResult.user || user,
    };
  } catch (restError: any) {
    return {
      success: false,
      error: restError.message || 'Registration failed',
    };
  }
}

/**
 * Refresh auth token via GraphQL with fallback
 */
export async function serverRefreshToken(): Promise<{
  success: boolean;
  authToken?: string;
  error?: string;
}> {
  const refreshToken = await getRefreshToken();
  
  if (!refreshToken) {
    return {
      success: false,
      error: 'No refresh token available',
    };
  }
  
  // Try GraphQL refresh
  if (isGraphQLAuthAvailable()) {
    try {
      const newAuthToken = await graphqlRefreshToken(refreshToken);
      await setAuthToken(newAuthToken);
      
      return {
        success: true,
        authToken: newAuthToken,
      };
    } catch (graphqlError: any) {
      console.warn('GraphQL token refresh failed:', graphqlError.message);
      // Fall through - refresh token might be invalid
    }
  }
  
  // Clear tokens if refresh failed
  await clearAuthToken();
  await clearRefreshToken();
  
  return {
    success: false,
    error: 'Token refresh failed',
  };
}

/**
 * Logout - clear all auth cookies
 */
export async function serverLogout(): Promise<void> {
  await clearAuthToken();
  await clearRefreshToken();
  await clearWCSessionToken();
}

/**
 * Validate current session
 */
export async function serverValidateSession(): Promise<{
  valid: boolean;
  user?: any;
}> {
  const authToken = await getAuthToken();
  
  if (!authToken) {
    return { valid: false };
  }
  
  // Try GraphQL validation first
  if (isGraphQLAuthAvailable()) {
    const viewer = await graphqlGetViewer(authToken);
    if (viewer) {
      return {
        valid: true,
        user: normalizeGraphQLUser(viewer),
      };
    }
  }
  
  // Try refreshing token
  const refreshResult = await serverRefreshToken();
  if (refreshResult.success && refreshResult.authToken) {
    // Re-validate with new token
    if (isGraphQLAuthAvailable()) {
      const viewer = await graphqlGetViewer(refreshResult.authToken);
      if (viewer) {
        return {
          valid: true,
          user: normalizeGraphQLUser(viewer),
        };
      }
    }
  }
  
  return { valid: false };
}

/**
 * Get current authenticated user
 */
export async function serverGetCurrentUser(): Promise<any | null> {
  const authToken = await getAuthToken();
  
  if (!authToken) {
    return null;
  }
  
  if (isGraphQLAuthAvailable()) {
    const viewer = await graphqlGetViewer(authToken);
    if (viewer) {
      return normalizeGraphQLUser(viewer);
    }
  }
  
  return null;
}

// ============================================================================
// Cart Sync Functions
// ============================================================================

/**
 * Merge guest cart into user cart after login
 * This should be called after successful login
 */
export async function mergeGuestCart(guestItems: Array<{
  productId: number;
  quantity: number;
  variationId?: number;
}>): Promise<boolean> {
  const authToken = await getAuthToken();
  const sessionToken = await getWCSessionToken();
  
  if (!authToken || !guestItems.length) {
    return false;
  }
  
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return false;
  }
  
  try {
    // Add each guest cart item to the user's WooCommerce cart
    for (const item of guestItems) {
      const url = `${wpBase}/wp-json/wc/store/v1/cart/add-item`;
      
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...(sessionToken ? { 'X-WC-Session': sessionToken } : {}),
        },
        body: JSON.stringify({
          id: item.productId,
          quantity: item.quantity,
          variation: item.variationId ? [{ attribute: 'variation_id', value: item.variationId }] : undefined,
        }),
        cache: 'no-store',
      });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to merge guest cart:', error);
    return false;
  }
}

/**
 * Sync local cart with WooCommerce after login
 */
export async function syncCartAfterLogin(localCartItems: Array<{
  productId: number;
  quantity: number;
  variationId?: number;
}>): Promise<{
  success: boolean;
  mergedCount: number;
  error?: string;
}> {
  if (!localCartItems.length) {
    return { success: true, mergedCount: 0 };
  }
  
  try {
    const success = await mergeGuestCart(localCartItems);
    
    return {
      success,
      mergedCount: success ? localCartItems.length : 0,
      error: success ? undefined : 'Failed to merge cart items',
    };
  } catch (error: any) {
    return {
      success: false,
      mergedCount: 0,
      error: error.message || 'Cart sync failed',
    };
  }
}

