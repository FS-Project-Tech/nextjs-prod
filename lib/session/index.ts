/**
 * Session Management Module
 * Centralized exports for session management functionality
 */

// Types
export * from './types';

// Core session management
export {
  generateSessionId,
  generateCsrfToken,
  generateFingerprint,
  validateCsrfToken,
  parseJwtPayload,
  getTokenExpiry,
  shouldRefreshToken,
  createSession,
  validateSession,
  cacheSession,
  getCachedSession,
  invalidateCachedSession,
  clearSessionCache,
  createSessionError,
  createSessionEvent,
  serializeSessionForClient,
  updateSession,
  extendSession,
  markSessionRefreshing,
  expireSession,
} from './manager';

// Secure fetch
export {
  secureFetch,
  sessionGet,
  sessionPost,
  sessionPut,
  sessionDelete,
  sessionPatch,
} from './secure-fetch';

// Auth session
export {
  authenticateWithCredentials,
  validateAuthToken,
  refreshAuthToken,
  fetchUserData,
  validateAndRefreshSession,
  logoutSession,
  createSessionFromToken,
} from './auth-session';

// WooCommerce session
export {
  createWcSession,
  syncWcCart,
  addToWcCart,
  removeFromWcCart,
  updateWcCartItem,
  clearWcCart,
  applyWcCoupon,
  removeWcCoupon,
  getWcCustomer,
  mergeWcCart,
  initializeWcSession,
} from './wc-session';

// Data fetching with session
export {
  CACHE_TTL,
  invalidateCache,
  fetchProductsWithSession,
  fetchProductWithSession,
  fetchCategoriesWithSession,
  fetchVariationsWithSession,
  fetchReviewsWithSession,
  searchProductsWithSession,
  fetchRelatedProductsWithSession,
  fetchOrdersWithSession,
  createOrderWithSession,
  fetchOrderWithSession,
  prefetchPageData,
} from './data-fetcher';

export type {
  WCProduct,
  WCCategory,
  PaginatedResponse,
} from './data-fetcher';

// React hooks (client-side only)
export {
  SessionProvider,
  useSession,
  useAuthenticatedSession,
  useSessionData,
  useSessionCart,
} from './useSession';

export type { SessionContextType } from './useSession';

// Server-side utilities (use in Server Components and API routes)
// Note: These use Next.js cookies() and should only be imported server-side
export {
  getServerSession,
  validateServerSession,
  isAuthenticated,
  getSessionUserId,
  hasRole,
  isAdmin,
  requireAuth,
  requireRole,
} from './server';

// Role helpers (non-duplicated)
export { hasAnyRole } from './manager';

