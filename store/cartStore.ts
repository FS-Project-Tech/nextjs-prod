"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateSubtotal } from "@/lib/cart/pricing";
import type { CartItem } from "@/lib/types/cart";
import { trackAddToCart } from "@/lib/analytics";

const EMPTY_ITEMS: CartItem[] = [];

function normalizeItems(raw: unknown[]): CartItem[] {
  return raw.map((item) => ({
    ...(item as CartItem),
    price: Number((item as CartItem).price).toFixed(2),
  }));
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
      x.variationId !== y.variationId
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
  /** One-time import from legacy `cart:v1:*` keys when the Zustand slice is still empty. */
  migrateFromLegacyKey: (legacyStorageKey: string) => void;
  setItems: (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  addItem: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateItemQty: (id: string, qty: number) => void;
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

      migrateFromLegacyKey: (legacyStorageKey) => {
        if (typeof window === "undefined" || !legacyStorageKey) return;
        const state = get();
        if (sliceItems(state).length > 0) return;
        try {
          const raw = localStorage.getItem(legacyStorageKey);
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const items = normalizeItems(parsed);
          const isGuest = legacyStorageKey === "cart:v1:guest";
          const m = legacyStorageKey.match(/^cart:v1:user:(.+)$/);
          const legacyUserId = m?.[1];
          if (isGuest) {
            set({ guestItems: items });
          } else if (legacyUserId) {
            set({ userCarts: { ...state.userCarts, [legacyUserId]: items } });
          }
        } catch {
          /* ignore corrupt legacy */
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
    },
  ),
);

/** Subscribe to the active cart lines (guest or logged-in bucket). */
export function useCartStoreItems(): CartItem[] {
  return useCartStore((s) =>
    !s.activeUserId ? s.guestItems : (s.userCarts[s.activeUserId] ?? EMPTY_ITEMS),
  );
}

export function useCartStoreTotalString(): string {
  const items = useCartStoreItems();
  return calculateSubtotal(items).toFixed(2);
}
