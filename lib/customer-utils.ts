/**
 * Customer Utilities
 * Provides optimized customer ID retrieval with caching and fallback strategies
 */

import { getWpBaseUrl } from '@/lib/auth';
import wcAPI from '@/lib/woocommerce';

/**
 * Simple in-memory cache for customer IDs
 * Key: email, Value: { customerId: number, timestamp: number }
 */
const customerIdCache = new Map<string, { customerId: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Helper to ensure customer ID is an integer (WooCommerce API requirement)
 */
export function toIntCustomerId(id: unknown): number | null {
  if (id === null || id === undefined) return null;
  const num = typeof id === 'string' ? parseInt(id, 10) : Number(id);
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Get cached customer ID for an email
 */
function getCachedCustomerId(email: string): number | null {
  const cached = customerIdCache.get(email.toLowerCase());
  if (!cached) return null;
  
  // Check if cache is still valid
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    customerIdCache.delete(email.toLowerCase());
    return null;
  }
  
  return cached.customerId;
}

/**
 * Cache customer ID for an email
 */
function cacheCustomerId(email: string, customerId: number): void {
  customerIdCache.set(email.toLowerCase(), {
    customerId,
    timestamp: Date.now(),
  });
}

/**
 * Clear cached customer ID (useful after customer updates)
 */
export function clearCustomerIdCache(email?: string): void {
  if (email) {
    customerIdCache.delete(email.toLowerCase());
  } else {
    customerIdCache.clear();
  }
}

/**
 * Get customer ID from WordPress session endpoint
 */
async function getCustomerIdFromSession(
  token: string,
  wpBase: string
): Promise<number | null> {
  try {
    const response = await fetch(`${wpBase}/wp-json/custom-auth/v1/session-info`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      const customerId = toIntCustomerId(data.customer_id);
      if (customerId) {
        return customerId;
      }
    }
  } catch (error) {
    // Session endpoint might not be available, that's okay
    if (process.env.NODE_ENV === 'development') {
      console.debug('Session endpoint not available:', error);
    }
  }
  return null;
}

/**
 * Get customer ID by email from WooCommerce API
 */
async function getCustomerIdByEmail(
  email: string,
  token: string,
  wpBase: string
): Promise<number | null> {
  try {
    // Try WooCommerce API client first
    try {
      const response = await wcAPI.get('/customers', {
        params: { email },
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const customerId = toIntCustomerId(response.data[0].id);
        if (customerId) {
          return customerId;
        }
      }
    } catch (wcError) {
      // Fallback to direct API call
    }

    // Fallback to direct API call with JWT token
    const response = await fetch(
      `${wpBase}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const customers = await response.json();
      if (Array.isArray(customers) && customers.length > 0) {
        const customerId = toIntCustomerId(customers[0].id);
        if (customerId) {
          return customerId;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching customer by email:', error);
  }
  return null;
}

/**
 * Get customer data by customer ID (direct lookup - fastest)
 */
export async function getCustomerById(
  customerId: number,
  token: string
): Promise<any | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  try {
    // Try WooCommerce API client first
    try {
      const response = await wcAPI.get(`/customers/${customerId}`);
      if (response.data) {
        return response.data;
      }
    } catch (wcError) {
      // Fallback to direct API call
    }

    // Fallback to direct API call with JWT token
    const response = await fetch(`${wpBase}/wp-json/wc/v3/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error fetching customer by ID:', error);
  }
  return null;
}

/**
 * Get customer data by email (fallback method)
 */
export async function getCustomerByEmail(
  email: string,
  token: string
): Promise<any | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  try {
    // Try WooCommerce API client first
    try {
      const response = await wcAPI.get('/customers', {
        params: { email },
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }
    } catch (wcError) {
      // Fallback to direct API call
    }

    // Fallback to direct API call with JWT token
    const response = await fetch(
      `${wpBase}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const customers = await response.json();
      if (Array.isArray(customers) && customers.length > 0) {
        return customers[0];
      }
    }
  } catch (error) {
    console.error('Error fetching customer by email:', error);
  }
  return null;
}

/**
 * Get customer ID with hybrid approach (cached -> session -> email lookup)
 * This is the main function to use for getting customer ID
 * 
 * @param userEmail - User's email address
 * @param token - JWT authentication token
 * @returns Customer ID as integer or null if not found
 */
export async function getCustomerIdWithFallback(
  userEmail: string,
  token: string
): Promise<number | null> {
  if (!userEmail || !token) {
    return null;
  }

  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return null;
  }

  const emailLower = userEmail.toLowerCase();

  // Step 1: Check cache first (fastest)
  const cachedId = getCachedCustomerId(emailLower);
  if (cachedId) {
    return cachedId;
  }

  // Step 2: Try session endpoint (if available)
  const sessionId = await getCustomerIdFromSession(token, wpBase);
  if (sessionId) {
    cacheCustomerId(emailLower, sessionId);
    return sessionId;
  }

  // Step 3: Fallback to email lookup (current method)
  const emailId = await getCustomerIdByEmail(userEmail, token, wpBase);
  if (emailId) {
    cacheCustomerId(emailLower, emailId);
    return emailId;
  }

  return null;
}

/**
 * Get customer data with optimized retrieval
 * Uses customer ID if available, falls back to email lookup
 * 
 * @param userEmail - User's email address
 * @param token - JWT authentication token
 * @returns Customer data object or null
 */
export async function getCustomerData(
  userEmail: string,
  token: string
): Promise<any | null> {
  if (!userEmail || !token) {
    return null;
  }

  // Try to get customer ID first
  const customerId = await getCustomerIdWithFallback(userEmail, token);
  
  if (customerId) {
    // Fast path: Direct lookup by ID
    const customer = await getCustomerById(customerId, token);
    if (customer) {
      return customer;
    }
  }

  // Fallback: Lookup by email
  return await getCustomerByEmail(userEmail, token);
}

