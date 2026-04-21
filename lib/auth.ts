// Re-export client-safe utilities
export { getWpBaseUrl } from "@/lib/wp-utils";  

// Re-export types (client-safe)
export type { AuthenticatedUser, AuthSession } from "@/lib/auth-server";

// Note: Server-only functions (getAuthToken, setAuthToken, clearAuthToken, validateToken, getUserData, authenticateUser, createWooUser)
// are now in lib/auth-server.ts and should be imported from there in Server Components and API routes.
