"use client";

import { Component, useEffect, useState, useRef, ReactNode, ErrorInfo, useMemo } from "react";

/** Only show auth loading UI if verification takes longer than this (ms). */
const AUTH_LOADING_DELAY_MS = 400;
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { AuthStatus } from "@/contexts/AuthContext";
import { sessionToAppUser, type AppSessionUser } from "@/lib/next-auth-user";

export type User = AppSessionUser;

export interface AuthContextData {
  user: User | null;
  status: AuthStatus;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export interface WithAuthOptions {
  redirectTo?: string;
  requireRoles?: string[];
  fallback?: ReactNode;
  showLoading?: boolean;
}

export interface WithAuthProps {
  user: User;
}

/**
 * Error Boundary Component for Protected Routes
 */
class AuthErrorBoundary extends Component<
  { children: ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Auth Error Boundary caught an error:", error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center max-w-md p-6">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message ||
                "An unexpected error occurred. Please try refreshing the page."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Loading Spinner Component
 */
function AuthLoadingSpinner({ message = "Verifying authentication..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-teal-600 border-r-transparent mb-4"></div>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

/**
 * Higher-Order Component for Protected Routes
 *
 * @param Component - The component to protect
 * @param options - Configuration options
 * @returns Protected component with authentication check
 *
 * Features:
 * - Uses NextAuth useSession() (single /api/auth/session on load)
 * - Shows loading spinner during verification
 * - Redirects to login with 'next' parameter
 * - Passes user data to wrapped component
 * - Error boundary for error handling
 * - Role-based access control (optional)
 */
export default function withAuth<P extends object>(
  Component: React.ComponentType<P & WithAuthProps>,
  options: WithAuthOptions = {}
) {
  const { redirectTo = "/login", requireRoles = [], fallback, showLoading = true } = options;

  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session, status: naStatus } = useSession();
    const user = useMemo(() => {
      if (naStatus !== "authenticated" || !session) return null;
      return sessionToAppUser(session);
    }, [session, naStatus]);
    const status: AuthStatus =
      naStatus === "loading"
        ? "loading"
        : naStatus === "authenticated" && user
          ? "authenticated"
          : "unauthenticated";
    const isLoading = naStatus === "loading";
    const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
    const [roleError, setRoleError] = useState<string | null>(null);
    const redirectedRef = useRef(false);
    const [showLoadingUI, setShowLoadingUI] = useState(false);
    const loadingDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isAuthPending = status === "loading" || isLoading || !hasCheckedAuth;

    // Only show "Verifying authentication..." after a delay (avoids flash when auth is fast)
    useEffect(() => {
      if (!isAuthPending) {
        if (loadingDelayRef.current) {
          clearTimeout(loadingDelayRef.current);
          loadingDelayRef.current = null;
        }
        setShowLoadingUI(false);
        return;
      }
      loadingDelayRef.current = setTimeout(() => {
        loadingDelayRef.current = null;
        setShowLoadingUI(true);
      }, AUTH_LOADING_DELAY_MS);
      return () => {
        if (loadingDelayRef.current) {
          clearTimeout(loadingDelayRef.current);
          loadingDelayRef.current = null;
        }
      };
    }, [isAuthPending]);

    // Handle authentication state changes
    useEffect(() => {
      // Skip if already redirected
      if (redirectedRef.current) {
        return;
      }

      if (status === "loading" || isLoading) {
        return;
      }

      // Mark that we've checked auth
      setHasCheckedAuth(true);

      // Redirect if not authenticated
      if (status === "unauthenticated" || !user) {
        redirectedRef.current = true;
        const currentPath = pathname || window.location.pathname;
        const redirectUrl = `${redirectTo}?next=${encodeURIComponent(currentPath)}`;
        router.replace(redirectUrl);
        return;
      }

      // Check role-based access if required
      if (requireRoles.length > 0 && user.roles) {
        const hasRequiredRole = requireRoles.some((role) => user.roles.includes(role));

        if (!hasRequiredRole) {
          setRoleError("You do not have permission to access this page.");
          redirectedRef.current = true;
          router.replace("/");
          return;
        }
      }
    }, [user, status, isLoading, router, pathname, redirectTo, requireRoles]);

    // Show loading state only after delay (so fast auth never shows spinner)
    if (isAuthPending) {
      if (fallback) {
        return <>{fallback}</>;
      }
      if (showLoading && showLoadingUI) {
        return <AuthLoadingSpinner message="Verifying authentication..." />;
      }
      return null;
    }

    // Show role error
    if (roleError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center max-w-md p-6">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">{roleError}</p>
            <button
              onClick={() => router.replace("/")}
              className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    // Check authentication status - if not authenticated, show nothing (redirect is happening)
    if (status === "unauthenticated" || !user) {
      return null;
    }

    // Render protected component with user prop
    return (
      <AuthErrorBoundary>
        <Component {...(props as P)} user={user} />
      </AuthErrorBoundary>
    );
  };
}

/**
 * Hook for protected pages (alternative to HOC)
 * Returns user data and handles redirects
 * Uses NextAuth useSession()
 */
export function useProtectedPage(options: WithAuthOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: naStatus } = useSession();
  const user = useMemo(() => {
    if (naStatus !== "authenticated" || !session) return null;
    return sessionToAppUser(session);
  }, [session, naStatus]);
  const status: AuthStatus =
    naStatus === "loading"
      ? "loading"
      : naStatus === "authenticated" && user
        ? "authenticated"
        : "unauthenticated";
  const isLoading = naStatus === "loading";
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  const { redirectTo = "/login", requireRoles = [] } = options;

  useEffect(() => {
    // Skip if already redirected
    if (redirectedRef.current) {
      return;
    }

    // Wait for auth to finish loading
    if (status === "loading" || isLoading) {
      return;
    }

    // Mark that we've checked auth
    setHasCheckedAuth(true);

    // Redirect if not authenticated
    if (status === "unauthenticated" || !user) {
      redirectedRef.current = true;
      const currentPath = pathname || window.location.pathname;
      router.replace(`${redirectTo}?next=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Check role-based access if required
    if (requireRoles.length > 0 && user.roles) {
      const hasRole = requireRoles.some((role) => user.roles.includes(role));
      if (!hasRole) {
        setError("Insufficient permissions");
        redirectedRef.current = true;
        router.replace("/");
        return;
      }
    }
  }, [user, status, isLoading, router, pathname, redirectTo, requireRoles]);

  return {
    user,
    loading: status === "loading" || isLoading || !hasCheckedAuth,
    error,
    isAuthenticated: status === "authenticated" && !!user && hasCheckedAuth,
  };
}
