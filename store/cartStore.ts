"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateSubtotal } from "@/lib/cart/pricing";
import type { CartItem } from "@/lib/types/cart";
import { trackAddToCart } from "@/lib/analytics";

const EMPTY_ITEMS: CartItem[] = [];

/** Fires after zustand `persist` has rehydrated from localStorage (avoids empty-cart flash on refresh). */
const cartPersistListeners = new Set<() => void>();
let cartPersistHydrated = false;

function notifyCartPersistHydrated(): void {
  if (cartPersistHydrated) return;
  cartPersistHydrated = true;
  for (const fn of cartPersistListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  cartPersistListeners.clear();
}

/**
 * `true` on the server (no storage to wait for). On the client, `true` only after persist rehydration.
 */
export function getCartPersistHydrated(): boolean {
  if (typeof window === "undefined") return true;
  return cartPersistHydrated;
}

export function subscribeCartPersistHydrated(fn: () => void): () => void {
  if (getCartPersistHydrated()) {
    queueMicrotask(fn);
    return () => {};
  }
  cartPersistListeners.add(fn);
  return () => {
    cartPersistListeners.delete(fn);
  };
}

function normalizeItems(raw: unknown[]): CartItem[] {
  return raw.map((item) => ({
    ...(item as CartItem),
    price: Number((item as CartItem).price).toFixed(2),
  }));
}

/** Variation-safe merge key (matches cart line id rules). */
export function cartLineMergeKey(productId: number, variationId?: number): string {
  const v = variationId != null && variationId > 0 ? variationId : 0;
  return `${productId}:${v}`;
}

function stableLineId(productId: number, variationId?: number): string {
  return variationId != null && variationId > 0 ? `${productId}:${variationId}` : String(productId);
}

function mergeTwoLines(primary: CartItem, secondary: CartItem): CartItem {
  const qty = primary.qty + secondary.qty;
  return {
    ...primary,
    ...secondary,
    id: primary.id,
    productId: primary.productId,
    variationId: primary.variationId,
    qty,
    price: Number(secondary.price) > Number(primary.price) ? secondary.price : primary.price,
  };
}

function mergeCartLinesByProduct(existing: CartItem[], incoming: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of existing) {
    map.set(cartLineMergeKey(it.productId, it.variationId), { ...it });
  }
  for (const g of incoming) {
    const k = cartLineMergeKey(g.productId, g.variationId);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        ...g,
        id: stableLineId(g.productId, g.variationId),
      });
    } else {
      map.set(k, mergeTwoLines(cur, g));
    }
  }
  return Array.from(map.values());
}

function sliceItems(state: CartStoreState): CartItem[] {
  const uid = state.activeUserId;
  if (!uid) return state.guestItems;
  return state.userCarts[uid] ?? EMPTY_ITEMS;
}

function areItemsShallowEqual(a: CartItem[], b: CartItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.qty !== y.qty ||
      x.price !== y.price ||
      x.productId !== y.productId ||
      x.variationId !== y.variationId ||
      x.wc_store_item_key !== y.wc_store_item_key ||
      x.empowerEligible !== y.empowerEligible
    ) {
      return false;
    }
  }
  return true;
}

function setSlice(
  state: CartStoreState,
  next: CartItem[],
): Pick<CartStoreState, "guestItems" | "userCarts"> {
  const uid = state.activeUserId;
  if (!uid) return { guestItems: next, userCarts: state.userCarts };
  return { guestItems: state.guestItems, userCarts: { ...state.userCarts, [uid]: next } };
}

type CartStoreState = {
  guestItems: CartItem[];
  userCarts: Record<string, CartItem[]>;
  /** `null` = guest cart bucket */
  activeUserId: string | null;
  setActiveUserId: (userId: string | null) => void;
  /**
   * Merge `guestItems` into `userCarts[userId]` by product_id + variation_id (sum qty).
   * Clears `guestItems` only. Does **not** change `activeUserId` — caller sets it after merge.
   */
  mergeGuestIntoUserBucket: (userId: string) => void;
  /** Clear only the guest bucket (never touches user carts). */
  clearGuestCartOnly: () => void;
  /** Clear a specific user's bucket (does not change activeUserId). */
  clearUserCartBucket: (userId: string) => void;
  /** If `userCarts[userId]` is empty, import from legacy `cart:v1:user:{id}` in localStorage. */
  hydrateUserBucketFromLegacyIfEmpty: (userId: string) => void;
  /** If guest bucket is empty, import from legacy `cart:v1:guest`. */
  hydrateGuestBucketFromLegacyIfEmpty: () => void;
  setItems: (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  addItem: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateItemQty: (id: string, qty: number) => void;
  /** Clears only the **active** bucket (guest or current user). */
  clear: () => void;
  replaceItems: (items: CartItem[]) => void;
};

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      guestItems: [],
      userCarts: {},
      activeUserId: null,

      setActiveUserId: (userId) =>
        set((state) => (state.activeUserId === userId ? state : { activeUserId: userId })),

      mergeGuestIntoUserBucket: (userId) => {
        if (!userId) return;
        set((state) => {
          const guest = state.guestItems;
          if (guest.length === 0) {
            return state;
          }
          const existing = state.userCarts[userId] ?? [];
          const merged = mergeCartLinesByProduct(existing, guest);
          if (process.env.NODE_ENV === "development") {
            console.log("[cartStore] mergeGuestIntoUserBucket", {
              userId,
              guestCount: guest.length,
              existingCount: existing.length,
              mergedCount: merged.length,
            });
          }
          return {
            guestItems: [],
            userCarts: { ...state.userCarts, [userId]: merged },
          };
        });
      },

      clearGuestCartOnly: () => {
        set((state) => (state.guestItems.length === 0 ? state : { guestItems: [] }));
      },

      clearUserCartBucket: (userId) => {
        if (!userId) return;
        set((state) => {
          if (!state.userCarts[userId]?.length) return state;
          const next = { ...state.userCarts };
          delete next[userId];
          return { userCarts: next };
        });
      },

      hydrateUserBucketFromLegacyIfEmpty: (userId) => {
        if (typeof window === "undefined" || !userId) return;
        const state = get();
        const bucket = state.userCarts[userId] ?? [];
        if (bucket.length > 0) return;
        try {
          const raw = localStorage.getItem(`cart:v1:user:${userId}`);
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const items = normalizeItems(parsed);
          set({
            userCarts: { ...state.userCarts, [userId]: items },
          });
          if (process.env.NODE_ENV === "development") {
            console.log("[cartStore] hydrateUserBucketFromLegacyIfEmpty", { userId, count: items.length });
          }
        } catch {
          /* ignore */
        }
      },

      hydrateGuestBucketFromLegacyIfEmpty: () => {
        if (typeof window === "undefined") return;
        const state = get();
        if (state.guestItems.length > 0) return;
        try {
          const raw = localStorage.getItem("cart:v1:guest");
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const items = normalizeItems(parsed);
          set({ guestItems: items });
          if (process.env.NODE_ENV === "development") {
            console.log("[cartStore] hydrateGuestBucketFromLegacyIfEmpty", { count: items.length });
          }
        } catch {
          /* ignore */
        }
      },

      setItems: (updater) => {
        const state = get();
        const prev = sliceItems(state);
        const next = typeof updater === "function" ? (updater as (p: CartItem[]) => CartItem[])(prev) : updater;
        if (areItemsShallowEqual(prev, next)) return;
        set(setSlice(state, next));
      },

      addItem: (input) => {
        const id =
          input.id || `${input.productId}${input.variationId ? ":" + input.variationId : ""}`;
        const state = get();
        const prev = sliceItems(state);
        const idx = prev.findIndex((p) => p.id === id);
        let next: CartItem[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = {
            ...next[idx],
            ...input,
            qty: next[idx].qty + input.qty,
            id: next[idx].id,
          };
        } else {
          next = [...prev, { ...input, id } as CartItem];
        }
        set(setSlice(state, next));

        queueMicrotask(() => {
          const unitPrice = parseFloat(String(input.price ?? "0")) || 0;
          if (unitPrice >= 0 && input.productId) {
            trackAddToCart({
              id: input.productId,
              name: input.name || "Product",
              price: unitPrice,
              quantity: Math.max(1, input.qty),
              sku: input.sku ?? undefined,
            });
          }
        });
      },

      removeItem: (id) => {
        const state = get();
        set(setSlice(
          state,
          sliceItems(state).filter((p) => p.id !== id),
        ));
      },

      updateItemQty: (id, qty) => {
        const state = get();
        set(setSlice(
          state,
          sliceItems(state).map((item) =>
            item.id === id ? { ...item, qty: Math.max(1, qty) } : item,
          ),
        ));
      },

      clear: () => {
        const state = get();
        if (sliceItems(state).length === 0) return;
        set(setSlice(state, []));
      },

      replaceItems: (items) => {
        const state = get();
        if (areItemsShallowEqual(sliceItems(state), items)) return;
        set(setSlice(state, items));
      },
    }),
    {
      name: "headless-cart-v1",
      partialize: (s) => ({ guestItems: s.guestItems, userCarts: s.userCarts }),
      onRehydrateStorage: () => {
        return (_state, error: unknown) => {
          if (error && process.env.NODE_ENV === "development") {
            console.warn("[cartStore] persist rehydration error", error);
          }
          notifyCartPersistHydrated();
        };
      },
    },
  ),
);

/** Subscribe to the active cart lines (guest or logged-in bucket). */
export function useCartStoreItems(): CartItem[] {
  return useCartStore((s) =>
    !s.activeUserId ? s.guestItems : (s.userCarts[s.activeUserId] ?? EMPTY_ITEMS),
  );
}

/** Read current cart lines imperatively (active bucket). */
export function getActiveCartSnapshot(): CartItem[] {
  const s = useCartStore.getState();
  const uid = s.activeUserId;
  return !uid ? s.guestItems : (s.userCarts[uid] ?? EMPTY_ITEMS);
}

/** Read a user's bucket without switching active user (for dashboard / merge guards). */
export function getUserCartBucketSnapshot(userId: string): CartItem[] {
  return useCartStore.getState().userCarts[userId] ?? EMPTY_ITEMS;
}

export function useCartStoreTotalString(): string {
  const items = useCartStoreItems();
  return calculateSubtotal(items).toFixed(2);
}
