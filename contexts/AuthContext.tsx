"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { clearAddressesDeletedIds } from "@/hooks/useAddresses";
import { sessionToAppUser, type AppSessionUser } from "@/lib/next-auth-user";

/** @deprecated Use AppSessionUser from @/lib/next-auth-user */
export type User = AppSessionUser;

export type AuthError = {
  code: string;
  message: string;
} | null;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: AuthStatus;
  error: AuthError;
  login: (
    username: string,
    password: string,
    redirectTo?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Refetches the NextAuth session (`GET /api/auth/session` only). */
  validateSession: () => Promise<void>;
  /** Same as validateSession — NextAuth session refetch, no legacy refresh API. */
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_SYNC_KEY = "auth-sync";
const INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL = 60 * 1000;

/**
 * Auth state from NextAuth only — one session fetch on load via SessionProvider.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, status: sessionStatus, update } = useSession();

  const [error, setError] = useState<AuthError>(null);
  const inactivityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const user = useMemo(() => {
    if (sessionStatus !== "authenticated" || !session) return null;
    return sessionToAppUser(session);
  }, [session, sessionStatus]);

  const status: AuthStatus = useMemo(() => {
    if (sessionStatus === "loading") return "loading";
    if (sessionStatus === "authenticated" && user) return "authenticated";
    if (sessionStatus === "authenticated" && !user) return "unauthenticated";
    return "unauthenticated";
  }, [sessionStatus, user]);

  const broadcastAuthChange = useCallback(
    (action: "login" | "logout" | "refresh", data?: { user?: AppSessionUser | null }) => {
      if (typeof window === "undefined") return;
      try {
        const syncData = {
          action,
          userId: data?.user?.id ?? null,
          timestamp: Date.now(),
        };
        window.localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify(syncData));
        window.dispatchEvent(
          new CustomEvent("storage", {
            detail: { key: AUTH_SYNC_KEY, action, data: syncData, timestamp: Date.now() },
          })
        );
      } catch {
        // ignore
      }
    },
    []
  );

  const refetchSession = useCallback(async () => {
    if (update) await update();
  }, [update]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
      redirectTo?: string
    ): Promise<{ success: boolean; error?: string }> => {
      setError(null);
      try {
        const result = await signIn("credentials", {
          redirect: false,
          username: username.trim(),
          password,
          callbackUrl: redirectTo || "/dashboard",
        });

        if (!result || result.error) {
          const errorMessage = result?.error || "Login failed. Please check your credentials.";
          setError({ code: "LOGIN_FAILED", message: errorMessage });
          return { success: false, error: errorMessage };
        }

        await refetchSession();
        broadcastAuthChange("login");

        const dest = result.url || redirectTo || "/dashboard";
        router.push(dest);
        return { success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An error occurred during login.";
        setError({ code: "LOGIN_ERROR", message: errorMessage });
        return { success: false, error: errorMessage };
      }
    },
    [router, refetchSession, broadcastAuthChange]
  );

  const logout = useCallback(async () => {
    setError(null);
    clearAddressesDeletedIds();
    broadcastAuthChange("logout");
    await signOut({ callbackUrl: "/login", redirect: true });
  }, [broadcastAuthChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      try {
        if (e.key !== AUTH_SYNC_KEY || !e.newValue) return;
        const data = JSON.parse(e.newValue) as { action?: string };
        if (data?.action === "logout") {
          signOut({ redirect: false }).catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || status !== "authenticated" || !user) return;

    lastActivityRef.current = Date.now();
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, updateActivity));

    if (inactivityCheckIntervalRef.current) {
      clearInterval(inactivityCheckIntervalRef.current);
    }
    inactivityCheckIntervalRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT) {
        if (inactivityCheckIntervalRef.current) {
          clearInterval(inactivityCheckIntervalRef.current);
          inactivityCheckIntervalRef.current = null;
        }
        void logout();
      }
    }, INACTIVITY_CHECK_INTERVAL);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      if (inactivityCheckIntervalRef.current) {
        clearInterval(inactivityCheckIntervalRef.current);
        inactivityCheckIntervalRef.current = null;
      }
    };
  }, [status, user, logout]);

  const value: AuthContextType = {
    user,
    isAuthenticated: status === "authenticated" && !!user,
    isLoading: status === "loading",
    status,
    error,
    login,
    logout,
    validateSession: refetchSession,
    refreshSession: refetchSession,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
