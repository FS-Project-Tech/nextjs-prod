/**
 * Authentication Utilities (Client-Safe)
 * Re-exports from auth-server for convenience, but this file is client-safe
 * Server-only functions are in lib/auth-server.ts
 */

// Re-export client-safe utilities
export { getWpBaseUrl } from './wp-utils';

// Re-export types (client-safe)
export type { AuthenticatedUser, AuthSession } from './auth-server';

// Note: Server-only functions (getAuthToken, setAuthToken, clearAuthToken, validateToken, getUserData, authenticateUser, createWooUser)
// are now in lib/auth-server.ts and should be imported from there in Server Components and API routes.
