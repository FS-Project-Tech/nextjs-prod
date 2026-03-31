/**
 * @deprecated This file is kept for backward compatibility.
 * Please use @/contexts/AuthContext instead.
 * 
 * This file provides a compatibility layer that maps the new AuthContext
 * interface to the old interface expected by existing code.
 */

"use client";

import { createContext, useContext } from 'react';
import { useAuth as useNewAuth, AuthProvider as NewAuthProvider, User } from '@/contexts/AuthContext';

// Old interface for backward compatibility
interface OldAuthContextType {
  user: User | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: (username: string, password: string, redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
}

const OldAuthContext = createContext<OldAuthContextType | null>(null);

// Compatibility wrapper for AuthProvider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <NewAuthProvider>{children}</NewAuthProvider>;
}

// Compatibility wrapper for useAuth hook
export function useAuth(): OldAuthContextType {
  const newAuth = useNewAuth();
  
  // Map new interface to old interface
  return {
    user: newAuth.user,
    status: newAuth.status === 'error' ? 'unauthenticated' : newAuth.status,
    loading: newAuth.isLoading,
    refresh: newAuth.validateSession,
    logout: newAuth.logout,
    login: newAuth.login,
  };
}

// Re-export User type for backward compatibility
export type { User };

