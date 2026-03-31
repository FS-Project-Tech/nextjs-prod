/**
 * Session Manager
 * Robust, scalable, and secure session management
 */

import {
  SessionData,
  SessionStatus,
  SessionType,
  SessionConfig,
  SessionValidationResult,
  SessionError,
  SessionErrorCode,
  SessionEvent,
  SessionEventType,
  DEFAULT_SESSION_CONFIG,
  SessionUser,
  SessionCustomer,
  CartSession,
} from './types';
import crypto from 'crypto';

/**
 * In-memory session cache for server-side
 */
const sessionCache = new Map<string, { data: SessionData; timestamp: number }>();
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Clean up expired cache entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessionCache.entries()) {
      if (now - value.timestamp > DEFAULT_SESSION_CONFIG.cacheMaxAge) {
        sessionCache.delete(key);
      }
    }
  }, CACHE_CLEANUP_INTERVAL);
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate session fingerprint from request
 */
export function generateFingerprint(userAgent?: string, ip?: string): string {
  const data = `${userAgent || ''}:${ip || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Validate CSRF token
 */
export function validateCsrfToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Parse JWT token without validation (for expiry check)
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Get token expiry from JWT
 */
export function getTokenExpiry(token: string): number | null {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return null;
  return (payload.exp as number) * 1000; // Convert to milliseconds
}

/**
 * Check if token needs refresh
 */
export function shouldRefreshToken(
  expiresAt: number,
  threshold: number = DEFAULT_SESSION_CONFIG.refreshThreshold
): boolean {
  return Date.now() + threshold >= expiresAt;
}

/**
 * Create a new session
 */
export function createSession(
  type: SessionType,
  options: {
    token?: string;
    refreshToken?: string;
    user?: SessionUser;
    customer?: SessionCustomer;
    cart?: CartSession;
    fingerprint?: string;
    config?: Partial<SessionConfig>;
  } = {}
): SessionData {
  const config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
  const now = Date.now();
  
  // Calculate expiry from token if provided
  let expiresAt = now + config.sessionTimeout;
  if (options.token) {
    const tokenExpiry = getTokenExpiry(options.token);
    if (tokenExpiry) {
      expiresAt = tokenExpiry;
    }
  }
  
  const session: SessionData = {
    id: generateSessionId(),
    type,
    status: SessionStatus.VALID,
    createdAt: now,
    expiresAt,
    lastValidated: now,
    token: options.token,
    refreshToken: options.refreshToken,
    user: options.user,
    customer: options.customer,
    cart: options.cart,
    csrfToken: config.enableCsrf ? generateCsrfToken() : undefined,
    fingerprint: options.fingerprint,
  };
  
  return session;
}

/**
 * Validate session data
 */
export function validateSession(
  session: SessionData | null,
  options: {
    fingerprint?: string;
    csrfToken?: string;
    config?: Partial<SessionConfig>;
  } = {}
): SessionValidationResult {
  const config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
  const now = Date.now();
  
  // No session
  if (!session) {
    return {
      isValid: false,
      status: SessionStatus.INVALID,
      shouldRefresh: false,
      expiresIn: 0,
      error: {
        code: SessionErrorCode.TOKEN_INVALID,
        message: 'No session found',
        retryable: false,
      },
    };
  }
  
  // Check expiry
  if (now >= session.expiresAt) {
    return {
      isValid: false,
      status: SessionStatus.EXPIRED,
      shouldRefresh: true,
      expiresIn: 0,
      error: {
        code: SessionErrorCode.TOKEN_EXPIRED,
        message: 'Session has expired',
        retryable: true,
      },
    };
  }
  
  // Check fingerprint (optional)
  if (config.enableFingerprint && session.fingerprint && options.fingerprint) {
    if (session.fingerprint !== options.fingerprint) {
      return {
        isValid: false,
        status: SessionStatus.INVALID,
        shouldRefresh: false,
        expiresIn: 0,
        error: {
          code: SessionErrorCode.FINGERPRINT_MISMATCH,
          message: 'Session fingerprint mismatch',
          retryable: false,
        },
      };
    }
  }
  
  // Check CSRF token (if provided)
  if (config.enableCsrf && options.csrfToken && session.csrfToken) {
    if (!validateCsrfToken(options.csrfToken, session.csrfToken)) {
      return {
        isValid: false,
        status: SessionStatus.INVALID,
        shouldRefresh: false,
        expiresIn: 0,
        error: {
          code: SessionErrorCode.CSRF_MISMATCH,
          message: 'CSRF token mismatch',
          retryable: false,
        },
      };
    }
  }
  
  const expiresIn = session.expiresAt - now;
  const shouldRefresh = shouldRefreshToken(session.expiresAt, config.refreshThreshold);
  
  return {
    isValid: true,
    status: session.status,
    shouldRefresh,
    expiresIn,
  };
}

/**
 * Cache session data
 */
export function cacheSession(session: SessionData): void {
  sessionCache.set(session.id, {
    data: session,
    timestamp: Date.now(),
  });
}

/**
 * Get cached session
 */
export function getCachedSession(sessionId: string): SessionData | null {
  const cached = sessionCache.get(sessionId);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > DEFAULT_SESSION_CONFIG.cacheMaxAge) {
    sessionCache.delete(sessionId);
    return null;
  }
  
  return cached.data;
}

/**
 * Invalidate cached session
 */
export function invalidateCachedSession(sessionId: string): void {
  sessionCache.delete(sessionId);
}

/**
 * Clear all cached sessions
 */
export function clearSessionCache(): void {
  sessionCache.clear();
}

/**
 * Create session error
 */
export function createSessionError(
  code: SessionErrorCode,
  message: string,
  retryable: boolean = false
): SessionError {
  return { code, message, retryable };
}

/**
 * Create session event
 */
export function createSessionEvent(
  type: SessionEventType,
  session?: Partial<SessionData>,
  error?: SessionError
): SessionEvent {
  return {
    type,
    timestamp: Date.now(),
    session,
    error,
  };
}

/**
 * Serialize session for storage (removes sensitive data for client)
 */
export function serializeSessionForClient(session: SessionData): Partial<SessionData> {
  return {
    id: session.id,
    type: session.type,
    status: session.status,
    expiresAt: session.expiresAt,
    user: session.user,
    customer: session.customer,
    cart: session.cart,
    csrfToken: session.csrfToken,
    // Never send token or refreshToken to client
  };
}

/**
 * Check if session is authenticated
 */
export function isAuthenticated(session: SessionData | null): boolean {
  if (!session) return false;
  if (session.type !== SessionType.AUTH) return false;
  if (session.status !== SessionStatus.VALID) return false;
  if (!session.token || !session.user) return false;
  return Date.now() < session.expiresAt;
}

/**
 * Check if session has specific role
 */
export function hasRole(session: SessionData | null, role: string): boolean {
  if (!isAuthenticated(session)) return false;
  return session?.user?.roles?.includes(role) ?? false;
}

/**
 * Check if session has any of the specified roles
 */
export function hasAnyRole(session: SessionData | null, roles: string[]): boolean {
  if (!isAuthenticated(session)) return false;
  return roles.some(role => session?.user?.roles?.includes(role));
}

/**
 * Update session with new data
 */
export function updateSession(
  session: SessionData,
  updates: Partial<SessionData>
): SessionData {
  const updated = {
    ...session,
    ...updates,
    lastValidated: Date.now(),
  };
  
  // Update cache
  cacheSession(updated);
  
  return updated;
}

/**
 * Extend session expiry
 */
export function extendSession(
  session: SessionData,
  additionalTime: number = DEFAULT_SESSION_CONFIG.sessionTimeout
): SessionData {
  return updateSession(session, {
    expiresAt: Date.now() + additionalTime,
  });
}

/**
 * Mark session as refreshing
 */
export function markSessionRefreshing(session: SessionData): SessionData {
  return updateSession(session, {
    status: SessionStatus.REFRESHING,
  });
}

/**
 * Expire session immediately
 */
export function expireSession(session: SessionData): SessionData {
  const expired = updateSession(session, {
    status: SessionStatus.EXPIRED,
    expiresAt: Date.now() - 1,
  });
  
  invalidateCachedSession(session.id);
  
  return expired;
}

