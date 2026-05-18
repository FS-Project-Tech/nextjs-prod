"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateSubtotal } from "@/lib/cart/pricing";
import { cartLineMergeKey } from "@/store/cartStore";
import type { CartItem } from "@/lib/types/cart";
import { clampToStockCap, getStockCap } from "@/lib/woo/stockLimit";

function stockCapForLine(line: Pick<CartItem, "manageStock" | "stockQuantity">): number | null {
  return getStockCap({
    manage_stock: line.manageStock,
    stock_quantity: line.stockQuantity,
  });
}

const EMPTY_ITEMS: CartItem[] = [];

function normalizeItems(raw: unknown[]): CartItem[] {
  return raw.map((item) => ({
    ...(item as CartItem),
    price: Number((item as CartItem).price).toFixed(2),
  }));
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

function mergeQuoteLinesByProduct(existing: CartItem[], incoming: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of existing) {
    map.set(cartLineMergeKey(it.productId, it.variationId), { ...it });
  }
  for (const g of incoming) {
    const k = cartLineMergeKey(g.productId, g.variationId);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { ...g, id: stableLineId(g.productId, g.variationId) });
    } else {
      map.set(k, mergeTwoLines(cur, g));
    }
  }
  return Array.from(map.values());
}

function sliceItems(state: QuoteStoreState): CartItem[] {
  const uid = state.activeUserId;
  if (!uid) return state.guestItems;
  return state.userQuotes[uid] ?? EMPTY_ITEMS;
}

function setSlice(
  state: QuoteStoreState,
  next: CartItem[],
): Pick<QuoteStoreState, "guestItems" | "userQuotes"> {
  const uid = state.activeUserId;
  if (!uid) return { guestItems: next, userQuotes: state.userQuotes };
  return { guestItems: state.guestItems, userQuotes: { ...state.userQuotes, [uid]: next } };
}

type QuoteStoreState = {
  guestItems: CartItem[];
  userQuotes: Record<string, CartItem[]>;
  /** `null` = guest quote bucket */
  activeUserId: string | null;
  setActiveUserId: (userId: string | null) => void;
  mergeGuestIntoUserBucket: (userId: string) => void;
  addItem: (input: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateItemQty: (id: string, qty: number) => void;
  clear: () => void;
  replaceItems: (items: CartItem[]) => void;
};

type LegacyPersistedQuote = {
  items?: CartItem[];
  guestItems?: CartItem[];
  userQuotes?: Record<string, CartItem[]>;
};

export const useQuoteStore = create<QuoteStoreState>()(
  persist(
    (set, get) => ({
      guestItems: [],
      userQuotes: {},
      activeUserId: null,

      setActiveUserId: (userId) =>
        set((state) => (state.activeUserId === userId ? state : { activeUserId: userId })),

      mergeGuestIntoUserBucket: (userId) => {
        if (!userId) return;
        set((state) => {
          const guest = state.guestItems;
          if (guest.length === 0) return state;
          const existing = state.userQuotes[userId] ?? [];
          const merged = mergeQuoteLinesByProduct(existing, guest);
          return {
            guestItems: [],
            userQuotes: { ...state.userQuotes, [userId]: merged },
          };
        });
      },

      addItem: (input) => {
        const id =
          input.id || `${input.productId}${input.variationId ? ":" + input.variationId : ""}`;
        const state = get();
        const prev = sliceItems(state);
        const idx = prev.findIndex((p) => p.id === id);
        let next: CartItem[];
        const cap = stockCapForLine({
          manageStock: input.manageStock,
          stockQuantity: input.stockQuantity,
        });
        if (idx >= 0) {
          next = [...prev];
          const mergedQty = next[idx].qty + input.qty;
          const lineCap =
            stockCapForLine({
              manageStock: input.manageStock ?? next[idx].manageStock,
              stockQuantity: input.stockQuantity ?? next[idx].stockQuantity,
            }) ?? cap;
          next[idx] = {
            ...next[idx],
            ...input,
            qty: clampToStockCap(mergedQty, lineCap),
            manageStock: input.manageStock ?? next[idx].manageStock,
            stockQuantity: input.stockQuantity ?? next[idx].stockQuantity,
            id: next[idx].id,
          };
        } else {
          next = [
            ...prev,
            { ...input, id, qty: clampToStockCap(input.qty, cap) } as CartItem,
          ];
        }
        set(setSlice(state, next));
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
            item.id === id
              ? { ...item, qty: clampToStockCap(qty, stockCapForLine(item)) }
              : item,
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
        set(setSlice(state, items));
      },
    }),
    {
      name: "headless-quote-v1",
      version: 2,
      partialize: (s) => ({
        guestItems: s.guestItems,
        userQuotes: s.userQuotes,
      }),
      migrate: (persistedState, version) => {
        const raw = persistedState as LegacyPersistedQuote;
        if (version >= 2 && Array.isArray(raw.guestItems)) {
          return {
            guestItems: normalizeItems(raw.guestItems),
            userQuotes: Object.fromEntries(
              Object.entries(raw.userQuotes ?? {}).map(([uid, lines]) => [
                uid,
                normalizeItems(Array.isArray(lines) ? lines : []),
              ]),
            ),
            activeUserId: null,
          };
        }
        const legacyGuest = Array.isArray(raw.items) ? normalizeItems(raw.items) : [];
        return {
          guestItems: legacyGuest,
          userQuotes: {},
          activeUserId: null,
        };
      },
    },
  ),
);

export function useQuoteStoreItems(): CartItem[] {
  return useQuoteStore((s) =>
    !s.activeUserId ? s.guestItems : (s.userQuotes[s.activeUserId] ?? EMPTY_ITEMS),
  );
}

export function getActiveQuoteSnapshot(): CartItem[] {
  const s = useQuoteStore.getState();
  const uid = s.activeUserId;
  return !uid ? s.guestItems : (s.userQuotes[uid] ?? EMPTY_ITEMS);
}

export function getQuoteItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

export function getQuoteSubtotal(items: CartItem[]): string {
  return calculateSubtotal(items).toFixed(2);
}

export { stableLineId as quoteStableLineId };
