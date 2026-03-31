/**
 * Session Management Types
 * Centralized type definitions for session management
 */

/**
 * Session status enum
 */
export enum SessionStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  INVALID = 'invalid',
  REFRESHING = 'refreshing',
  ERROR = 'error',
}

/**
 * Session type enum
 */
export enum SessionType {
  AUTH = 'auth',         // JWT authentication session
  CART = 'cart',         // WooCommerce cart session
  GUEST = 'guest',       // Anonymous guest session
}

/**
 * Authenticated user data
 */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  username: string;
  roles: string[];
  avatarUrl?: string;
}

/**
 * WooCommerce customer data
 */
export interface SessionCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  billing?: CustomerAddress;
  shipping?: CustomerAddress;
}

/**
 * Customer address
 */
export interface CustomerAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

/**
 * Cart session data
 */
export interface CartSession {
  cartKey: string;
  cartHash: string;
  itemCount: number;
  lastUpdated: number;
}

/**
 * Main session data structure
 */
export interface SessionData {
  // Session metadata
  id: string;
  type: SessionType;
  status: SessionStatus;
  createdAt: number;
  expiresAt: number;
  lastValidated: number;
  
  // Auth data (if authenticated)
  token?: string;
  refreshToken?: string;
  user?: SessionUser;
  customer?: SessionCustomer;
  
  // Cart data
  cart?: CartSession;
  
  // CSRF protection
  csrfToken?: string;
  
  // Fingerprint for validation
  fingerprint?: string;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  isValid: boolean;
  status: SessionStatus;
  shouldRefresh: boolean;
  expiresIn: number; // milliseconds until expiration
  error?: SessionError;
}

/**
 * Session error
 */
export interface SessionError {
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Session error codes
 */
export enum SessionErrorCode {
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  CSRF_MISMATCH = 'CSRF_MISMATCH',
  FINGERPRINT_MISMATCH = 'FINGERPRINT_MISMATCH',
}

/**
 * Session configuration
 */
export interface SessionConfig {
  // Timeouts (in milliseconds)
  sessionTimeout: number;        // How long session is valid
  refreshThreshold: number;      // When to refresh (before expiry)
  validationInterval: number;    // How often to validate
  networkTimeout: number;        // API request timeout
  
  // Retry configuration
  maxRetries: number;
  retryDelay: number;
  retryBackoff: number;          // Multiplier for exponential backoff
  
  // Security
  requireHttps: boolean;
  enableFingerprint: boolean;
  enableCsrf: boolean;
  
  // Caching
  enableCache: boolean;
  cacheMaxAge: number;
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTimeout: 60 * 60 * 1000,        // 1 hour
  refreshThreshold: 10 * 60 * 1000,      // 10 minutes before expiry
  validationInterval: 5 * 60 * 1000,     // Every 5 minutes
  networkTimeout: 10 * 1000,             // 10 seconds
  
  maxRetries: 3,
  retryDelay: 1000,                      // 1 second
  retryBackoff: 2,                       // Exponential backoff
  
  requireHttps: process.env.NODE_ENV === 'production',
  enableFingerprint: true,
  enableCsrf: true,
  
  enableCache: true,
  cacheMaxAge: 60 * 1000,                // 1 minute cache
};

/**
 * Fetch options with session
 */
export interface SessionFetchOptions extends RequestInit {
  requireAuth?: boolean;
  includeCart?: boolean;
  skipCache?: boolean;
  timeout?: number;
  retries?: number;
}

/**
 * Session fetch result
 */
export interface SessionFetchResult<T> {
  data: T | null;
  error: SessionError | null;
  status: number;
  cached: boolean;
  sessionValid: boolean;
}

/**
 * Session event types
 */
export enum SessionEventType {
  CREATED = 'session:created',
  VALIDATED = 'session:validated',
  REFRESHED = 'session:refreshed',
  EXPIRED = 'session:expired',
  INVALIDATED = 'session:invalidated',
  ERROR = 'session:error',
}

/**
 * Session event payload
 */
export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  session?: Partial<SessionData>;
  error?: SessionError;
}

