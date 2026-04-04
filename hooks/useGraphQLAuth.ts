"use client";

/**
 * useGraphQLAuth Hook
 *
 * React hook for GraphQL-based authentication with cart sync
 * Extends useAuth with GraphQL-specific functionality
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/components/CartProvider";
import { parseResponseJson } from "@/lib/parse-response-json";

// ============================================================================
// Types
// ============================================================================

export interface LoginOptions {
  redirectTo?: string;
  mergeCart?: boolean;
}

export interface RegisterOptions {
  redirectTo?: string;
  autoLogin?: boolean;
}

export interface UseGraphQLAuthReturn {
  // State from useAuth
  user: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: string;
  error: any;

  // GraphQL-specific actions
  graphqlLogin: (
    username: string,
    password: string,
    options?: LoginOptions
  ) => Promise<{ success: boolean; error?: string }>;
  graphqlRegister: (
    data: RegisterData,
    options?: RegisterOptions
  ) => Promise<{ success: boolean; error?: string }>;
  graphqlLogout: () => Promise<void>;
  refreshToken: () => Promise<{ success: boolean; error?: string }>;
  mergeCart: () => Promise<{ success: boolean; mergedCount: number }>;

  // Original useAuth actions
  validateSession: () => Promise<void>;
  clearError: () => void;
}

export interface RegisterData {
  username?: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGraphQLAuth(): UseGraphQLAuthReturn {
  const router = useRouter();
  const auth = useAuth();
  const { update } = useSession();
  const { items: cartItems, clear: clearLocalCart } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Login via GraphQL with optional cart merge
   */
  const graphqlLogin = useCallback(
    async (
      username: string,
      password: string,
      options: LoginOptions = {}
    ): Promise<{ success: boolean; error?: string }> => {
      const { redirectTo, mergeCart = true } = options;

      if (isProcessing) {
        return { success: false, error: "Already processing" };
      }

      setIsProcessing(true);

      try {
        // Prepare cart items for merge
        const cartItemsToMerge =
          mergeCart && cartItems.length > 0
            ? cartItems.map((item) => ({
                productId: item.productId,
                quantity: item.qty,
                variationId: item.variationId,
              }))
            : undefined;

        const response = await fetch("/api/auth/graphql/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username,
            password,
            cartItems: cartItemsToMerge,
            redirectTo,
          }),
        });

        const { data } = await parseResponseJson<{
          success?: boolean;
          error?: { message?: string };
          cartSync?: { mergedCount?: number };
          redirectTo?: string;
        }>(response);

        if (data === null) {
          return {
            success: false,
            error: "No response from server. Please try again.",
          };
        }

        if (!response.ok || !data.success) {
          return {
            success: false,
            error: data.error?.message || "Login failed",
          };
        }

        // Clear local cart if items were merged
        if (data.cartSync?.mergedCount > 0) {
          clearLocalCart();
        }

        await update?.();

        // Redirect
        if (data.redirectTo) {
          router.push(data.redirectTo);
        } else if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.push("/dashboard");
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "An error occurred",
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, cartItems, clearLocalCart, update, router]
  );

  /**
   * Register via GraphQL
   */
  const graphqlRegister = useCallback(
    async (
      data: RegisterData,
      options: RegisterOptions = {}
    ): Promise<{ success: boolean; error?: string }> => {
      const { redirectTo, autoLogin = true } = options;

      if (isProcessing) {
        return { success: false, error: "Already processing" };
      }

      setIsProcessing(true);

      try {
        const response = await fetch("/api/auth/graphql/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...data,
            redirectTo,
          }),
        });

        const { data: result } = await parseResponseJson<{
          success?: boolean;
          error?: { message?: string };
          redirectTo?: string;
        }>(response);

        if (result === null) {
          return {
            success: false,
            error: "No response from server. Please try again.",
          };
        }

        if (!response.ok || !result.success) {
          return {
            success: false,
            error: result.error?.message || "Registration failed",
          };
        }

        // Refresh auth state (registration includes auto-login)
        if (autoLogin) {
          await update?.();
        }

        // Redirect
        if (result.redirectTo) {
          router.push(result.redirectTo);
        } else if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.push("/dashboard");
        }

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "An error occurred",
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, update, router]
  );

  /**
   * Logout via GraphQL
   */
  const graphqlLogout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/graphql/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always call the original logout to clear state
      await auth.logout();
    }
  }, [auth]);

  /**
   * Refresh auth token
   */
  const refreshToken = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/auth/graphql/refresh", {
        method: "POST",
        credentials: "include",
      });

      const { data } = await parseResponseJson<{
        success?: boolean;
        error?: { message?: string };
      }>(response);

      if (data === null || !response.ok || !data.success) {
        return {
          success: false,
          error: data?.error?.message || "Token refresh failed",
        };
      }

      await update?.();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "An error occurred",
      };
    }
  }, [update]);

  /**
   * Merge local cart with WooCommerce cart
   */
  const mergeCart = useCallback(async (): Promise<{ success: boolean; mergedCount: number }> => {
    if (!auth.isAuthenticated || cartItems.length === 0) {
      return { success: true, mergedCount: 0 };
    }

    try {
      const itemsToMerge = cartItems.map((item) => ({
        productId: item.productId,
        quantity: item.qty,
        variationId: item.variationId,
      }));

      const response = await fetch("/api/cart/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: itemsToMerge }),
      });

      const { data } = await parseResponseJson<{
        success?: boolean;
        mergedCount?: number;
      }>(response);

      if (response.ok && data?.success) {
        // Clear local cart after successful merge
        clearLocalCart();
        return { success: true, mergedCount: data.mergedCount ?? 0 };
      }

      return { success: false, mergedCount: 0 };
    } catch (error) {
      console.error("Cart merge error:", error);
      return { success: false, mergedCount: 0 };
    }
  }, [auth.isAuthenticated, cartItems, clearLocalCart]);

  return {
    // State from useAuth
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading || isProcessing,
    status: auth.status,
    error: auth.error,

    // GraphQL-specific actions
    graphqlLogin,
    graphqlRegister,
    graphqlLogout,
    refreshToken,
    mergeCart,

    // Original useAuth actions
    validateSession: async () => {
      await update?.();
    },
    clearError: auth.clearError,
  };
}

export default useGraphQLAuth;
