"use client";

/**
 * React Hook for Session Management
 * Provides session state and actions for client components
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  SessionData,
  SessionStatus,
  SessionType,
  SessionEventType,
  SessionEvent,
  DEFAULT_SESSION_CONFIG,
} from "./types";
import { parseResponseJson } from "@/lib/parse-response-json";

/**
 * Session context type
 */
export interface SessionContextType {
  // State
  session: SessionData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateCart: (itemCount: number) => void;

  // Events
  onSessionEvent: (handler: (event: SessionEvent) => void) => () => void;
}

/**
 * Create session context
 */
const SessionContext = createContext<SessionContextType | null>(null);

/**
 * Session sync key for cross-tab communication
 */
const SESSION_SYNC_KEY = "session-sync";
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Session Provider Props
 */
interface SessionProviderProps {
  children: ReactNode;
  initialSession?: SessionData | null;
}

/**
 * Session Provider Component
 */
export function SessionProvider({ children, initialSession }: SessionProviderProps) {
  const [session, setSession] = useState<SessionData | null>(initialSession || null);
  const [isLoading, setIsLoading] = useState(!initialSession);
  const [error, setError] = useState<string | null>(null);

  const eventHandlersRef = useRef<Set<(event: SessionEvent) => void>>(new Set());
  const sessionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  /**
   * Emit session event
   */
  const emitEvent = useCallback(
    (type: SessionEventType, data?: Partial<SessionData>, err?: string) => {
      const event: SessionEvent = {
        type,
        timestamp: Date.now(),
        session: data,
        error: err ? { code: "ERROR" as any, message: err, retryable: false } : undefined,
      };

      eventHandlersRef.current.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error("Session event handler error:", e);
        }
      });
    },
    []
  );

  /**
   * Sync session across tabs
   */
  const syncSession = useCallback((newSession: SessionData | null) => {
    if (typeof window === "undefined") return;

    try {
      // Use localStorage only for sync signal, not actual data
      localStorage.setItem(
        SESSION_SYNC_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          hasSession: !!newSession,
        })
      );
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  /**
   * Initialize session on mount
   */
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initSession = async () => {
      try {
        // Check for existing session from API
        const response = await fetch("/api/auth/session", {
          credentials: "include",
        });

        if (response.ok) {
          const { data } = await parseResponseJson<{ session?: SessionData }>(response);
          if (data?.session) {
            setSession(data.session);
            emitEvent(SessionEventType.VALIDATED, data.session);
          }
        }
      } catch (e) {
        // Silently fail - user is not logged in
        console.debug("No existing session");
      } finally {
        setIsLoading(false);
      }
    };

    if (!initialSession) {
      initSession();
    } else {
      setIsLoading(false);
    }
  }, [initialSession, emitEvent]);

  /**
   * Listen for cross-tab sync
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== SESSION_SYNC_KEY) return;

      try {
        const data = e.newValue ? JSON.parse(e.newValue) : null;

        // If another tab logged out, refresh our session
        if (data && !data.hasSession && session) {
          setSession(null);
          emitEvent(SessionEventType.INVALIDATED);
        }
        // If another tab logged in, refresh our session
        else if (data?.hasSession && !session) {
          // Re-fetch session
          fetch("/api/auth/session", { credentials: "include" })
            .then((res) => parseResponseJson<{ session?: SessionData }>(res))
            .then(({ data: d }) => {
              if (d?.session) {
                setSession(d.session);
                emitEvent(SessionEventType.VALIDATED, d.session);
              }
            })
            .catch(() => {});
        }
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [session, emitEvent]);

  /**
   * Periodic session check
   */
  useEffect(() => {
    if (!session?.token) return;

    sessionCheckRef.current = setInterval(async () => {
      try {
        const response = await fetch("/api/auth/validate", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          // Session invalid, clear it
          setSession(null);
          setError("Session expired");
          emitEvent(SessionEventType.EXPIRED);
          syncSession(null);
        }
      } catch {
        // Network error, keep session
      }
    }, SESSION_CHECK_INTERVAL);

    return () => {
      if (sessionCheckRef.current) {
        clearInterval(sessionCheckRef.current);
      }
    };
  }, [session?.token, emitEvent, syncSession]);

  /**
   * Login action
   */
  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
          credentials: "include",
        });

        const { data } = await parseResponseJson<{
          session?: SessionData;
          error?: string;
          message?: string;
        }>(response);

        if (!response.ok) {
          const errorMsg = data?.error || data?.message || "Login failed";
          setError(errorMsg);
          emitEvent(SessionEventType.ERROR, undefined, errorMsg);
          return { success: false, error: errorMsg };
        }

        if (data === null) {
          const errorMsg = "No response from server. Please try again.";
          setError(errorMsg);
          emitEvent(SessionEventType.ERROR, undefined, errorMsg);
          return { success: false, error: errorMsg };
        }

        if (data.session) {
          setSession(data.session);
          emitEvent(SessionEventType.CREATED, data.session);
          syncSession(data.session);
          return { success: true };
        }

        return { success: false, error: "No session returned" };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Login failed";
        setError(errorMsg);
        emitEvent(SessionEventType.ERROR, undefined, errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [emitEvent, syncSession]
  );

  /**
   * Logout action
   */
  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore logout errors
    } finally {
      setSession(null);
      setError(null);
      emitEvent(SessionEventType.INVALIDATED);
      syncSession(null);
      setIsLoading(false);
    }
  }, [emitEvent, syncSession]);

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async () => {
    if (!session?.token) return;

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const { data } = await parseResponseJson<{ session?: SessionData }>(response);
        if (data?.session) {
          setSession(data.session);
          emitEvent(SessionEventType.REFRESHED, data.session);
        }
      }
    } catch (e) {
      // Refresh failed, session may still be valid
      console.debug("Session refresh failed:", e);
    }
  }, [session?.token, emitEvent]);

  /**
   * Update cart count
   */
  const updateCart = useCallback(
    (itemCount: number) => {
      if (!session) return;

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cart: {
            ...prev.cart,
            cartKey: prev.cart?.cartKey || "",
            cartHash: prev.cart?.cartHash || "",
            itemCount,
            lastUpdated: Date.now(),
          },
        };
      });
    },
    [session]
  );

  /**
   * Subscribe to session events
   */
  const onSessionEvent = useCallback((handler: (event: SessionEvent) => void) => {
    eventHandlersRef.current.add(handler);
    return () => {
      eventHandlersRef.current.delete(handler);
    };
  }, []);

  const value: SessionContextType = {
    session,
    isAuthenticated: !!session?.token && session.status === SessionStatus.VALID,
    isLoading,
    error,
    login,
    logout,
    refreshSession,
    updateCart,
    onSessionEvent,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Use session hook
 */
export function useSession(): SessionContextType {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return context;
}

/**
 * Use authenticated session hook
 * Throws if not authenticated
 */
export function useAuthenticatedSession(): SessionContextType & { session: SessionData } {
  const context = useSession();

  if (!context.isAuthenticated || !context.session) {
    throw new Error("User must be authenticated");
  }

  return context as SessionContextType & { session: SessionData };
}

/**
 * Use session data only (no actions)
 */
export function useSessionData() {
  const { session, isAuthenticated, isLoading, error } = useSession();
  return { session, isAuthenticated, isLoading, error };
}

/**
 * Use cart from session
 */
export function useSessionCart() {
  const { session, updateCart } = useSession();

  return {
    cartKey: session?.cart?.cartKey || null,
    itemCount: session?.cart?.itemCount || 0,
    lastUpdated: session?.cart?.lastUpdated || null,
    updateCart,
  };
}
