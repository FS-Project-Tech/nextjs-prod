/**
 * Authentication Session Management
 * Handles JWT-based authentication with token refresh
 */

import {
  SessionData,
  SessionType,
  SessionStatus,
  SessionUser,
  SessionErrorCode,
  SessionValidationResult,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  createSession,
  updateSession,
  validateSession,
  expireSession,
  cacheSession,
  getCachedSession,
  invalidateCachedSession,
  createSessionError,
  generateFingerprint,
  getTokenExpiry,
  shouldRefreshToken,
} from './manager';
import { secureFetch } from './secure-fetch';
import { getWpBaseUrl } from '../wp-utils';

/**
 * WordPress JWT endpoints
 */
const WP_ENDPOINTS = {
  token: '/wp-json/jwt-auth/v1/token',
  validate: '/wp-json/jwt-auth/v1/token/validate',
  refresh: '/wp-json/jwt-auth/v1/token/refresh',
  user: '/wp-json/wp/v2/users/me',
};

/**
 * Token refresh lock to prevent concurrent refreshes
 */
const refreshLocks = new Map<string, Promise<SessionData | null>>();

/**
 * Authenticate user with credentials
 */
export async function authenticateWithCredentials(
  username: string,
  password: string,
  options: {
    fingerprint?: string;
  } = {}
): Promise<{
  success: boolean;
  session: SessionData | null;
  error?: string;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      success: false,
      session: null,
      error: 'WordPress URL not configured',
    };
  }
  
  // Validate inputs
  if (!username || !password) {
    return {
      success: false,
      session: null,
      error: 'Username and password are required',
    };
  }
  
  try {
    const response = await fetch(`${wpBase}${WP_ENDPOINTS.token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.message || errorData?.error || 'Authentication failed';
      
      // Don't expose specific error details in production
      const safeMessage = process.env.NODE_ENV === 'development'
        ? errorMessage
        : 'Invalid username or password';
      
      return {
        success: false,
        session: null,
        error: safeMessage,
      };
    }
    
    const data = await response.json();
    
    if (!data.token) {
      return {
        success: false,
        session: null,
        error: 'No token received from server',
      };
    }
    
    // Extract user data from JWT response
    const user: SessionUser = {
      id: data.user_id || 0,
      email: data.user_email || '',
      name: data.user_display_name || data.user_nicename || '',
      username: data.user_nicename || '',
      roles: Array.isArray(data.roles) ? data.roles : [],
    };
    
    // Create session
    const session = createSession(SessionType.AUTH, {
      token: data.token,
      user,
      fingerprint: options.fingerprint,
    });
    
    // Add refreshToken separately if it exists
    if (data.refresh_token) {
      (session as any).refreshToken = data.refresh_token;
    }
    
    // Cache session
    cacheSession(session);
    
    return {
      success: true,
      session,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return {
      success: false,
      session: null,
      error: process.env.NODE_ENV === 'development' ? message : 'Authentication failed',
    };
  }
}

/**
 * Validate token with WordPress
 */
export async function validateAuthToken(
  token: string
): Promise<SessionValidationResult> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return {
      isValid: false,
      status: SessionStatus.ERROR,
      shouldRefresh: false,
      expiresIn: 0,
      error: createSessionError(
        SessionErrorCode.VALIDATION_FAILED,
        'WordPress URL not configured',
        false
      ),
    };
  }
  
  // First check token expiry locally
  const expiry = getTokenExpiry(token);
  if (expiry && Date.now() >= expiry) {
    return {
      isValid: false,
      status: SessionStatus.EXPIRED,
      shouldRefresh: true,
      expiresIn: 0,
      error: createSessionError(
        SessionErrorCode.TOKEN_EXPIRED,
        'Token has expired',
        true
      ),
    };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${wpBase}${WP_ENDPOINTS.validate}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const status = response.status;
      
      if (status === 401 || status === 403) {
        return {
          isValid: false,
          status: SessionStatus.INVALID,
          shouldRefresh: status === 401,
          expiresIn: 0,
          error: createSessionError(
            SessionErrorCode.TOKEN_INVALID,
            'Token is invalid or revoked',
            status === 401
          ),
        };
      }
      
      return {
        isValid: false,
        status: SessionStatus.ERROR,
        shouldRefresh: false,
        expiresIn: 0,
        error: createSessionError(
          SessionErrorCode.VALIDATION_FAILED,
          `Validation failed with status ${status}`,
          true
        ),
      };
    }
    
    const expiresIn = expiry ? expiry - Date.now() : DEFAULT_SESSION_CONFIG.sessionTimeout;
    
    return {
      isValid: true,
      status: SessionStatus.VALID,
      shouldRefresh: shouldRefreshToken(
        Date.now() + expiresIn,
        DEFAULT_SESSION_CONFIG.refreshThreshold
      ),
      expiresIn,
    };
  } catch (error) {
    // Handle timeout gracefully
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        isValid: false,
        status: SessionStatus.ERROR,
        shouldRefresh: true,
        expiresIn: 0,
        error: createSessionError(
          SessionErrorCode.NETWORK_ERROR,
          'Validation request timed out',
          true
        ),
      };
    }
    
    return {
      isValid: false,
      status: SessionStatus.ERROR,
      shouldRefresh: true,
      expiresIn: 0,
      error: createSessionError(
        SessionErrorCode.NETWORK_ERROR,
        error instanceof Error ? error.message : 'Validation failed',
        true
      ),
    };
  }
}

/**
 * Refresh authentication token
 */
export async function refreshAuthToken(
  session: SessionData
): Promise<{
  success: boolean;
  session: SessionData | null;
  error?: string;
}> {
  if (!session.token) {
    return {
      success: false,
      session: null,
      error: 'No token to refresh',
    };
  }
  
  // Check for concurrent refresh
  const existingRefresh = refreshLocks.get(session.id);
  if (existingRefresh) {
    const result = await existingRefresh;
    return {
      success: !!result,
      session: result,
      error: result ? undefined : 'Refresh failed',
    };
  }
  
  // Create refresh promise
  const refreshPromise = performTokenRefresh(session);
  refreshLocks.set(session.id, refreshPromise);
  
  try {
    const result = await refreshPromise;
    return {
      success: !!result,
      session: result,
      error: result ? undefined : 'Token refresh failed',
    };
  } finally {
    refreshLocks.delete(session.id);
  }
}

/**
 * Perform the actual token refresh
 */
async function performTokenRefresh(
  session: SessionData
): Promise<SessionData | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase || !session.token) {
    return null;
  }
  
  try {
    // Some JWT plugins support refresh token endpoint
    if (session.refreshToken) {
      const response = await fetch(`${wpBase}${WP_ENDPOINTS.refresh}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.refreshToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          const refreshedSession = updateSession(session, {
            token: data.token,
            refreshToken: data.refresh_token || session.refreshToken,
            status: SessionStatus.VALID,
            expiresAt: getTokenExpiry(data.token) || Date.now() + DEFAULT_SESSION_CONFIG.sessionTimeout,
          });
          
          cacheSession(refreshedSession);
          return refreshedSession;
        }
      }
    }
    
    // Fallback: Re-validate existing token
    // Some JWT implementations extend token validity on validation
    const validation = await validateAuthToken(session.token);
    
    if (validation.isValid) {
      const validatedSession = updateSession(session, {
        status: SessionStatus.VALID,
        expiresAt: Date.now() + validation.expiresIn,
      });
      
      cacheSession(validatedSession);
      return validatedSession;
    }
    
    // Token is truly expired/invalid
    return null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Token refresh failed:', error);
    }
    return null;
  }
}

/**
 * Get user data from WordPress
 */
export async function fetchUserData(
  token: string
): Promise<SessionUser | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return null;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${wpBase}${WP_ENDPOINTS.user}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const user = await response.json();
    
    if (!user || !user.id) {
      return null;
    }
    
    return {
      id: user.id,
      email: user.email || '',
      name: user.name || user.display_name || '',
      username: user.slug || user.user_login || user.nicename || '',
      roles: user.roles || [],
      avatarUrl: user.avatar_urls?.['96'] || user.avatar_urls?.['48'],
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Failed to fetch user data:', error);
    }
    return null;
  }
}

/**
 * Validate and refresh session if needed
 */
export async function validateAndRefreshSession(
  session: SessionData,
  options: {
    fingerprint?: string;
    csrfToken?: string;
  } = {}
): Promise<{
  valid: boolean;
  session: SessionData | null;
  error?: string;
}> {
  // Validate session structure
  const validation = validateSession(session, options);
  
  if (!validation.isValid) {
    // Check if we should try to refresh
    if (validation.shouldRefresh && session.token) {
      const refreshResult = await refreshAuthToken(session);
      if (refreshResult.success && refreshResult.session) {
        return {
          valid: true,
          session: refreshResult.session,
        };
      }
    }
    
    return {
      valid: false,
      session: null,
      error: validation.error?.message || 'Session invalid',
    };
  }
  
  // Check if token needs server validation
  if (session.token) {
    const tokenValidation = await validateAuthToken(session.token);
    
    if (!tokenValidation.isValid) {
      if (tokenValidation.shouldRefresh) {
        const refreshResult = await refreshAuthToken(session);
        if (refreshResult.success && refreshResult.session) {
          return {
            valid: true,
            session: refreshResult.session,
          };
        }
      }
      
      return {
        valid: false,
        session: null,
        error: tokenValidation.error?.message || 'Token validation failed',
      };
    }
    
    // Token is valid, check if refresh is needed soon
    if (tokenValidation.shouldRefresh) {
      // Refresh in background (don't await)
      refreshAuthToken(session).catch(() => {
        // Ignore refresh errors
      });
    }
    
    // Update session validation timestamp
    const validatedSession = updateSession(session, {
      lastValidated: Date.now(),
      expiresAt: Date.now() + tokenValidation.expiresIn,
    });
    
    return {
      valid: true,
      session: validatedSession,
    };
  }
  
  return {
    valid: true,
    session,
  };
}

/**
 * Logout and invalidate session
 */
export async function logoutSession(session: SessionData): Promise<void> {
  // Expire the session
  expireSession(session);
  
  // Remove from cache
  invalidateCachedSession(session.id);
  
  // Note: JWT tokens can't be truly invalidated server-side
  // without a token blacklist. The token will remain valid
  // until it expires naturally. For true invalidation,
  // implement a token blacklist in WordPress.
}

/**
 * Create session from existing token
 */
export async function createSessionFromToken(
  token: string,
  options: {
    fingerprint?: string;
  } = {}
): Promise<SessionData | null> {
  // Validate token first
  const validation = await validateAuthToken(token);
  
  if (!validation.isValid) {
    return null;
  }
  
  // Fetch user data
  const user = await fetchUserData(token);
  
  if (!user) {
    return null;
  }
  
  // Create session
  const session = createSession(SessionType.AUTH, {
    token,
    user,
    fingerprint: options.fingerprint,
  });
  
  // Cache session
  cacheSession(session);
  
  return session;
}

