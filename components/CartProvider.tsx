"use client";
 
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { calculateSubtotal } from "@/lib/cart/pricing";
import type { CartItem } from "@/lib/types/cart";
import { useUser } from "@/hooks/useUser";
import {
  getActiveCartSnapshot,
  getUserCartBucketSnapshot,
  useCartStore,
  useCartStoreItems,
} from "@/store/cartStore";
import { readAppliedCouponFromSession } from "@/lib/coupon/clientAppliedCouponSession";
 
export type { CartItem };
 
const WOO_PUSH_DEBOUNCE_MS = 450;
 
interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isSyncing: boolean;
  isHydrated: boolean;
  syncError: string | null;
  open: () => void;
  close: () => void;
  addItem: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateItemQty: (id: string, qty: number) => void;
  clear: () => void;
  /** Push current Zustand cart to Woo (clear + re-add). Never reads Woo into Zustand. */
  syncWithWooCommerce: (couponCode?: string) => Promise<void>;
  validateCart: () => Promise<{
    valid: boolean;
    errors: Array<{ itemId: string; message: string }>;
  }>;
  total: string;
  /** Re-fetch dashboard mirror when cart is empty (logged-in only). */
  refreshCartFromServer: () => void;
  /** True while guest→user merge / login cart transition runs. */
  isCartMerging: boolean;
  /** Clear guest bucket only (safe after server merge). */
  clearGuestCart: () => void;
  /** Clear a specific user's persisted bucket (does not change active user). */
  clearUserCart: (userId: string) => void;
  /**
   * Logged-in: true after the first `/api/dashboard/cart/load` attempt completes (or skipped when
   * the user bucket already had lines). Guest sessions leave this false — ignore when no user.
   */
  hasLoadedServerCart: boolean;
}
 
const CartContext = createContext<CartState | undefined>(undefined);
 
export default function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useCartStoreItems();
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCartMerging, setIsCartMerging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const cartMergeBlockingRef = useRef(false);
  const loginTransitionReadyUidRef = useRef<string | null>(null);
  const { user, loading: authLoading } = useUser();
  const [hasLoadedServerCart, setHasLoadedServerCart] = useState(false);
  const loadRetryCount = useRef(0);
  const itemsRef = useRef<CartItem[]>([]);
  itemsRef.current = items;
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  const serverCartLoadGenerationRef = useRef(0);
  const wooSyncMutexRef = useRef(Promise.resolve());
  const wooPushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wooPushDepthRef = useRef(0);
 
  useEffect(() => {
    userIdRef.current = user?.id ? String(user.id) : undefined;
  }, [user?.id]);
 
  /** Guest session: no active user, optional legacy guest import. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authLoading) {
      setIsHydrated(false);
      return;
    }
    if (user?.id) return;
 
    loginTransitionReadyUidRef.current = null;
    useCartStore.getState().setActiveUserId(null);
    useCartStore.getState().hydrateGuestBucketFromLegacyIfEmpty();
    serverCartLoadGenerationRef.current += 1;
    setHasLoadedServerCart(false);
    loadRetryCount.current = 0;
    setIsHydrated(true);
  }, [authLoading, user?.id]);
 
  const saveCartToServerNow = useCallback(async (lines: CartItem[]): Promise<boolean> => {
    if (!userIdRef.current) return false;
    const snapshot = JSON.stringify({ items: lines });
    try {
      const res = await fetch("/api/dashboard/cart/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: snapshot,
        keepalive: true,
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (res.ok && data.success === true) {
        lastSavedSnapshotRef.current = snapshot;
        return true;
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[CartProvider] immediate cart save failed", e);
      }
    }
    return false;
  }, []);
 
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const onUnload = () => {
      const current = itemsRef.current;
      const payload = JSON.stringify({ items: current });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/dashboard/cart/save", blob);
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [user?.id]);
 
  const cancelDebouncedWooPush = useCallback(() => {
    if (wooPushDebounceRef.current) {
      clearTimeout(wooPushDebounceRef.current);
      wooPushDebounceRef.current = null;
    }
  }, []);
 
  const performWooPush = useCallback(async (lines: CartItem[], couponCode?: string) => {
    wooPushDepthRef.current += 1;
    if (wooPushDepthRef.current === 1) {
      setIsSyncing(true);
      setSyncError(null);
    }
    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[CartProvider] Woo push — Zustand snapshot (source of truth):", lines);
      }
 
      if (lines.length === 0) {
        const res = await fetch("/api/cart/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: "{}",
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          const msg =
            typeof data.error === "string" && data.error.trim()
              ? data.error.trim()
              : "Failed to clear WooCommerce cart";
          throw new Error(msg);
        }
        if (process.env.NODE_ENV === "development") {
          console.log("[CartProvider] Woo push — cleared (empty Zustand cart)", data);
        }
        return;
      }
 
      const res = await fetch("/api/cart/add-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ items: lines, couponCode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        lineCount?: number;
        clientLineCount?: number;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Failed to push cart to WooCommerce";
        throw new Error(msg);
      }
      if (process.env.NODE_ENV === "development") {
        console.log("[CartProvider] Woo push — server ack (not applied to Zustand):", data);
      }
    } finally {
      wooPushDepthRef.current -= 1;
      if (wooPushDepthRef.current <= 0) {
        wooPushDepthRef.current = 0;
        setIsSyncing(false);
      }
    }
  }, []);
 
  const enqueueWooPush = useCallback(
    (lines: CartItem[], couponCode?: string) => {
      if (cartMergeBlockingRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log("[CartProvider] Woo push skipped (cart login merge in progress)");
        }
        return;
      }
      const trimmedExplicit = couponCode?.trim();
      const fromSession = readAppliedCouponFromSession().code ?? undefined;
      const resolvedCoupon = trimmedExplicit || fromSession;
      wooSyncMutexRef.current = wooSyncMutexRef.current
        .then(() => performWooPush(lines, resolvedCoupon))
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Cart sync failed";
          setSyncError(msg);
          if (process.env.NODE_ENV === "development") {
            console.warn("[CartProvider] Woo push failed (Zustand unchanged)", e);
          }
        });
    },
    [performWooPush],
  );
 
  /**
   * Runs before paint and before dashboard `useEffect` so `activeUserId` is set before any `setItems`
   * from `/api/dashboard/cart/load`.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    if (!user?.id) return;
 
    const uid = String(user.id);
    const needsTransition = loginTransitionReadyUidRef.current !== uid;
 
    if (!needsTransition) {
      setIsHydrated(true);
      return;
    }
 
    cartMergeBlockingRef.current = true;
    setIsCartMerging(true);
    try {
      const store = useCartStore.getState();
      if (process.env.NODE_ENV === "development") {
        console.log("[CartProvider] login transition (before merge)", {
          uid,
          guestCount: store.guestItems.length,
          userBucketCount: (store.userCarts[uid] ?? []).length,
          activeUserId: store.activeUserId,
        });
      }
      store.hydrateUserBucketFromLegacyIfEmpty(uid);
      store.mergeGuestIntoUserBucket(uid);
      store.setActiveUserId(uid);
      loginTransitionReadyUidRef.current = uid;
      if (process.env.NODE_ENV === "development") {
        const s = useCartStore.getState();
        console.log("[CartProvider] login transition (after merge + setActiveUserId)", {
          guestCount: s.guestItems.length,
          userBucketCount: (s.userCarts[uid] ?? []).length,
          activeUserId: s.activeUserId,
        });
      }
    } finally {
      cartMergeBlockingRef.current = false;
      setIsCartMerging(false);
      setIsHydrated(true);
    }
 
    cancelDebouncedWooPush();
    enqueueWooPush(getActiveCartSnapshot());
  }, [authLoading, user?.id, cancelDebouncedWooPush, enqueueWooPush]);
 
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (isCartMerging) return;
    if (!user?.id) {
      setHasLoadedServerCart(false);
      loadRetryCount.current = 0;
      return;
    }
    const uid = String(user.id);
    if (getUserCartBucketSnapshot(uid).length > 0) {
      setHasLoadedServerCart(true);
      return;
    }
    if (hasLoadedServerCart) return;
    if (loadRetryCount.current >= 20) {
      setHasLoadedServerCart(true);
      return;
    }
 
    let cancelled = false;
 
    const load = async () => {
      const generationAtStart = serverCartLoadGenerationRef.current;
      try {
        const res = await fetch("/api/dashboard/cart/load", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          loadRetryCount.current += 1;
          if (loadRetryCount.current < 20) {
            retryTimeoutRef.current = setTimeout(load, 500);
          } else {
            setHasLoadedServerCart(true);
          }
          return;
        }
        loadRetryCount.current = 0;
        const data = await res.json();
        if (cancelled) return;
        if (generationAtStart !== serverCartLoadGenerationRef.current) {
          setHasLoadedServerCart(true);
          return;
        }
        const serverItems: CartItem[] = Array.isArray(data.items) ? data.items : [];
        useCartStore.getState().setItems((current) =>
          current.length === 0 && serverItems.length > 0 ? serverItems : current,
        );
        lastSavedSnapshotRef.current = JSON.stringify({ items: serverItems });
        setHasLoadedServerCart(true);
      } catch (e) {
        loadRetryCount.current += 1;
        if (process.env.NODE_ENV === "development") {
          console.warn("[CartProvider] Failed to load server cart", e);
        }
        if (loadRetryCount.current < 20 && !cancelled) {
          retryTimeoutRef.current = setTimeout(load, 500);
        } else {
          setHasLoadedServerCart(true);
        }
      }
    };
 
    retryTimeoutRef.current = setTimeout(load, 600);
 
    return () => {
      cancelled = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [isHydrated, isCartMerging, user?.id, hasLoadedServerCart]);
 
  const scheduleDebouncedWooPush = useCallback(() => {
    if (cartMergeBlockingRef.current) return;
    cancelDebouncedWooPush();
    wooPushDebounceRef.current = setTimeout(() => {
      wooPushDebounceRef.current = null;
      enqueueWooPush(getActiveCartSnapshot());
    }, WOO_PUSH_DEBOUNCE_MS);
  }, [cancelDebouncedWooPush, enqueueWooPush]);
 
  const close = useCallback(() => setIsOpen(false), []);
 
  const addItem = useCallback(
    (input: Omit<CartItem, "id"> & { id?: string }) => {
      serverCartLoadGenerationRef.current += 1;
      useCartStore.getState().addItem(input);
      setSyncError(null);
      setIsOpen(true);
      scheduleDebouncedWooPush();
    },
    [scheduleDebouncedWooPush],
  );
 
  const removeItem = useCallback(
    (id: string) => {
      serverCartLoadGenerationRef.current += 1;
      if (cartSaveTimerRef.current) {
        clearTimeout(cartSaveTimerRef.current);
        cartSaveTimerRef.current = null;
      }
      cancelDebouncedWooPush();
 
      const line = getActiveCartSnapshot().find((i) => i.id === id);
      if (!line) return;
 
      useCartStore.getState().removeItem(id);
      void saveCartToServerNow(getActiveCartSnapshot());
      enqueueWooPush(getActiveCartSnapshot());
    },
    [saveCartToServerNow, cancelDebouncedWooPush, enqueueWooPush],
  );
 
  const updateItemQty = useCallback(
    (id: string, qty: number) => {
      serverCartLoadGenerationRef.current += 1;
      if (cartSaveTimerRef.current) {
        clearTimeout(cartSaveTimerRef.current);
        cartSaveTimerRef.current = null;
      }
      useCartStore.getState().updateItemQty(id, qty);
      void saveCartToServerNow(getActiveCartSnapshot());
      scheduleDebouncedWooPush();
    },
    [saveCartToServerNow, scheduleDebouncedWooPush],
  );
 
  const clear = useCallback(() => {
    serverCartLoadGenerationRef.current += 1;
    if (cartSaveTimerRef.current) {
      clearTimeout(cartSaveTimerRef.current);
      cartSaveTimerRef.current = null;
    }
    cancelDebouncedWooPush();
    useCartStore.getState().clear();
    setSyncError(null);
    void saveCartToServerNow([]);
    enqueueWooPush([]);
  }, [saveCartToServerNow, cancelDebouncedWooPush, enqueueWooPush]);
 
  useEffect(() => {
    if (!isHydrated) return;
    if (!user?.id) return;
    if (!hasLoadedServerCart) return;
 
    const snapshot = JSON.stringify({ items });
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }
 
    let cancelled = false;
 
    if (cartSaveTimerRef.current) {
      clearTimeout(cartSaveTimerRef.current);
      cartSaveTimerRef.current = null;
    }
 
    cartSaveTimerRef.current = setTimeout(() => {
      cartSaveTimerRef.current = null;
      if (cancelled) return;
      void (async () => {
        try {
          const res = await fetch("/api/dashboard/cart/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: snapshot,
          });
          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as { success?: boolean };
            if (data.success === true) {
              lastSavedSnapshotRef.current = snapshot;
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[CartProvider] Failed to save server cart", e);
          }
        }
      })();
    }, 400);
 
    return () => {
      cancelled = true;
      if (cartSaveTimerRef.current) {
        clearTimeout(cartSaveTimerRef.current);
        cartSaveTimerRef.current = null;
      }
    };
  }, [items, isHydrated, user?.id, hasLoadedServerCart]);
 
  const clearGuestCart = useCallback(() => {
    useCartStore.getState().clearGuestCartOnly();
  }, []);
 
  const clearUserCart = useCallback((userId: string) => {
    useCartStore.getState().clearUserCartBucket(userId);
  }, []);
 
  const syncWithWooCommerce = useCallback(
    async (couponCode?: string) => {
      if (cartMergeBlockingRef.current) return;
      cancelDebouncedWooPush();
      const lines = getActiveCartSnapshot();
      await new Promise<void>((resolve) => {
        wooSyncMutexRef.current = wooSyncMutexRef.current
          .then(() => performWooPush(lines, couponCode))
          .catch((e) => {
            const msg = e instanceof Error ? e.message : "Cart sync failed";
            setSyncError(msg);
            if (process.env.NODE_ENV === "development") {
              console.warn("[CartProvider] syncWithWooCommerce failed", e);
            }
          })
          .finally(() => resolve());
      });
    },
    [cancelDebouncedWooPush, performWooPush],
  );
 
  const refreshCartFromServer = useCallback(() => {
    serverCartLoadGenerationRef.current += 1;
    loadRetryCount.current = 0;
    setHasLoadedServerCart(false);
  }, []);
 
  const open = useCallback(() => {
    if (items.length > 0 && !cartMergeBlockingRef.current) {
      cancelDebouncedWooPush();
      enqueueWooPush(getActiveCartSnapshot());
    } else if (user?.id) {
      refreshCartFromServer();
    }
    setIsOpen(true);
  }, [items.length, user?.id, cancelDebouncedWooPush, enqueueWooPush, refreshCartFromServer]);
 
  const validateCart = useCallback(async () => {
    const snapshot = getActiveCartSnapshot();
    if (snapshot.length === 0) return { valid: true, errors: [] };
 
    if (process.env.NODE_ENV === "development") {
      console.log("[CartProvider] validateCart (checkout prep) — active bucket:", snapshot);
    }
 
    try {
      const response = await fetch("/api/validate-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ items: snapshot }),
      });
 
      const data = (await response.json().catch(() => ({}))) as {
        valid?: boolean;
        errors?: Array<{ itemId: string; message: string }>;
        items?: CartItem[];
      };
 
      if (!response.ok) {
        return {
          valid: false,
          errors: [{ itemId: "unknown", message: "Validation failed" }],
        };
      }
 
      if (
        data.valid === true &&
        Array.isArray(data.items) &&
        data.items.length === snapshot.length &&
        data.items.length > 0
      ) {
        const byId = new Map(snapshot.map((row) => [row.id, row]));
        const merged = data.items.map((row) => {
          const prev = byId.get(row.id);
          if (!prev) return row;
          return {
            ...row,
            empowerEligible: prev.empowerEligible === true,
          };
        });
        useCartStore.getState().replaceItems(merged);
        if (process.env.NODE_ENV === "development") {
          console.log("[CartProvider] validate-cart applied Woo prices to Zustand:", merged);
        }
      } else if (data.valid === true && process.env.NODE_ENV === "development") {
        console.warn("[CartProvider] validate-cart OK but skipped replaceItems (unexpected payload)", {
          snapshotLen: snapshot.length,
          returnedLen: Array.isArray(data.items) ? data.items.length : -1,
        });
      }
 
      return {
        valid: Boolean(data.valid),
        errors: Array.isArray(data.errors) ? data.errors : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed";
      return {
        valid: false,
        errors: [{ itemId: "unknown", message }],
      };
    }
  }, []);
 
  const total = useMemo(() => {
    return calculateSubtotal(items).toFixed(2);
  }, [items]);
 
  const value: CartState = useMemo(
    () => ({
      items,
      isOpen,
      isSyncing,
      isHydrated,
      isCartMerging,
      syncError,
      open,
      close,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      clearGuestCart,
      clearUserCart,
      syncWithWooCommerce,
      validateCart,
      total,
      refreshCartFromServer,
      hasLoadedServerCart,
    }),
    [
      items,
      isOpen,
      isSyncing,
      isHydrated,
      isCartMerging,
      syncError,
      open,
      close,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      clearGuestCart,
      clearUserCart,
      syncWithWooCommerce,
      validateCart,
      total,
      refreshCartFromServer,
      hasLoadedServerCart,
    ],
  );
 
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
 
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}