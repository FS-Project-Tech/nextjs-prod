/**
 * Authentication Types
 * Types for authentication and user management
 */

/**
 * User roles
 */
export type UserRole = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber' | 'customer';

/**
 * User interface
 */
export interface User {
  id: number;
  email: string;
  name: string;
  username: string;
  roles: UserRole[];
  customer?: Customer | null;
}

/**
 * WooCommerce customer data
 */
export interface Customer {
  id: number;
  billing_address?: Address;
  shipping_address?: Address;
  meta_data?: Record<string, unknown>;
}

/**
 * Address interface
 */
export interface Address {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}

/**
 * Auth status types
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

/**
 * Auth error types
 */
export interface AuthError {
  code: string;
  message: string;
}

/**
 * Auth context type
 */
export interface AuthContextType {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: AuthStatus;
  error: AuthError | null;
  
  // Actions
  login: (username: string, password: string, redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

/**
 * Session data
 */
export interface SessionData {
  token: string;
  user: User;
  expiresAt: number;
}

