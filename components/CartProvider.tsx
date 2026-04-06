"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { calculateSubtotal } from "@/lib/cart/pricing";
import type { CartItem } from "@/lib/types/cart";
import { useUser } from "@/hooks/useUser";
import { useCartStore, useCartStoreItems } from "@/store/cartStore";

// Re-export CartItem for backward compatibility
export type { CartItem };

// WooCommerce cart item from API response
interface WCCartItem {
  product_id: number;
  variation_id?: number;
  price: string;
  quantity: number;
}

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
  syncWithWooCommerce: (couponCode?: string) => Promise<void>;
  validateCart: () => Promise<{
    valid: boolean;
    errors: Array<{ itemId: string; message: string }>;
  }>;
  total: string;
  /** Re-fetch cart from server (for cross-browser: call when cart is empty on another device) */
  refreshCartFromServer: () => void;
}

const CartContext = createContext<CartState | undefined>(undefined);

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useCartStoreItems();
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { user, loading: authLoading } = useUser();
  const [hasLoadedServerCart, setHasLoadedServerCart] = useState(false);
  const loadRetryCount = useRef(0);
  const itemsRef = useRef<CartItem[]>([]);
  itemsRef.current = items;
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const cartKey = useMemo(() => {
    if (authLoading) return undefined;
    if (!user?.id) return "cart:v1:guest";
    return `cart:v1:user:${user.id}`;
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const store = useCartStore.getState();
    if (cartKey === undefined) {
      if (store.activeUserId !== null) {
        store.setActiveUserId(null);
      }
      setIsHydrated(false);
      return;
    }
    const { setActiveUserId, migrateFromLegacyKey, activeUserId } = useCartStore.getState();
    const nextUserId = user?.id ? String(user.id) : null;
    if (activeUserId !== nextUserId) {
      setActiveUserId(nextUserId);
    }
    migrateFromLegacyKey(cartKey);
    setIsHydrated(true);
  }, [cartKey, user?.id]);

  // Persist cart to server when user leaves the page (so other browsers get the latest)
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const onUnload = () => {
      const current = itemsRef.current;
      if (current.length === 0) return;
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

  // Load server-side cart for logged-in users (cross-browser persistence). Retry on 401 until session is ready.
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!user?.id) {
      setHasLoadedServerCart(false);
      loadRetryCount.current = 0;
      return;
    }
    if (hasLoadedServerCart) return;
    if (loadRetryCount.current >= 20) {
      setHasLoadedServerCart(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
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
        const serverItems: CartItem[] = Array.isArray(data.items) ? data.items : [];
        useCartStore.getState().setItems((current) =>
          serverItems.length > 0 || current.length === 0 ? serverItems : current,
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
  }, [isHydrated, user?.id, hasLoadedServerCart]);

  const close = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback((input: Omit<CartItem, "id"> & { id?: string }) => {
    useCartStore.getState().addItem(input);
    setSyncError(null);
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    useCartStore.getState().removeItem(id);
  }, []);

  const updateItemQty = useCallback((id: string, qty: number) => {
    useCartStore.getState().updateItemQty(id, qty);
  }, []);

  const clear = useCallback(() => {
    useCartStore.getState().clear();
    setSyncError(null);
  }, []);

  // Persist logged-in cart to server (account-based cart) whenever items change
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
            lastSavedSnapshotRef.current = snapshot;
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

  const syncWithWooCommerce = useCallback(
    async (couponCode?: string) => {
      if (items.length === 0) return;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      setIsSyncing(true);
      setSyncError(null);

      try {
        const response = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, couponCode }),
          credentials: "include",
        });

        if (!response.ok) {
          const error = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          const raw =
            (typeof error.error === "string" && error.error) ||
            (typeof error.message === "string" && error.message) ||
            "";
          let msg = raw || "Failed to sync cart";
          try {
            const parsed = JSON.parse(raw) as { message?: string };
            if (typeof parsed.message === "string" && parsed.message.trim()) {
              msg = parsed.message.trim();
            }
          } catch {
            /* use raw */
          }
          throw new Error(msg);
        }

        const data = await response.json();

        if (data.cart?.items) {
          const priceMap = new Map<string, string>();
          (data.cart.items as WCCartItem[]).forEach((wcItem) => {
            const itemId = `${wcItem.product_id}${
              wcItem.variation_id ? ":" + wcItem.variation_id : ""
            }`;
            priceMap.set(itemId, wcItem.price);
          });

          useCartStore.getState().setItems((prev) =>
            prev.map((item) => {
              const updatedPrice = priceMap.get(item.id);

              if (updatedPrice === undefined) return item;

              return {
                ...item,
                price: Number(updatedPrice).toFixed(2),
              };
            }),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to sync cart";
        console.error("Cart sync error:", error);
        setSyncError(message);
      } finally {
        syncInFlightRef.current = false;
        setIsSyncing(false);
      }
    },
    [items],
  );

  const refreshCartFromServer = useCallback(() => {
    loadRetryCount.current = 0;
    setHasLoadedServerCart(false);
  }, []);

  const open = useCallback(() => {
    if (items.length > 0) {
      setIsOpen(true);
      syncWithWooCommerce().catch(() => {});
    } else {
      setIsOpen(true);
      if (user?.id) refreshCartFromServer();
    }
  }, [items.length, syncWithWooCommerce, user?.id, refreshCartFromServer]);

  const validateCart = useCallback(async () => {
    if (items.length === 0) return { valid: true, errors: [] };

    try {
      const response = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        return {
          valid: false,
          errors: [{ itemId: "unknown", message: "Validation failed" }],
        };
      }

      const data = await response.json();
      return { valid: data.valid, errors: data.errors || [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed";
      return {
        valid: false,
        errors: [{ itemId: "unknown", message }],
      };
    }
  }, [items]);

  const total = useMemo(() => {
    return calculateSubtotal(items).toFixed(2);
  }, [items]);

  const value: CartState = useMemo(
    () => ({
      items,
      isOpen,
      isSyncing,
      isHydrated,
      syncError,
      open,
      close,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      syncWithWooCommerce,
      validateCart,
      total,
      refreshCartFromServer,
    }),
    [
      items,
      isOpen,
      isSyncing,
      isHydrated,
      syncError,
      open,
      close,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      syncWithWooCommerce,
      validateCart,
      total,
      refreshCartFromServer,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
