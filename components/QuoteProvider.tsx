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
import type { CartItem } from "@/lib/types/cart";
import { useUser } from "@/hooks/useUser";
import { getQuoteSubtotal, useQuoteStore, useQuoteStoreItems } from "@/store/quoteStore";

export type { CartItem as QuoteItem };

interface QuoteState {
  items: CartItem[];
  isOpen: boolean;
  ndisPanelOpen: boolean;
  open: () => void;
  close: () => void;
  openNdisPanel: () => void;
  closeNdisPanel: () => void;
  addItem: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  updateItemQty: (id: string, qty: number) => void;
  clear: () => void;
  total: string;
  itemCount: number;
}

const QuoteContext = createContext<QuoteState | undefined>(undefined);

export default function QuoteProvider({ children }: { children: React.ReactNode }) {
  const items = useQuoteStoreItems();
  const { user, loading: authLoading } = useUser();
  const loginTransitionReadyUidRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [ndisPanelOpen, setNdisPanelOpen] = useState(false);

  /** Guest bucket while logged out; on login merge guest lines into this user's bucket (same as cart). */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    if (!user?.id) return;

    const uid = String(user.id);
    if (loginTransitionReadyUidRef.current === uid) return;

    const store = useQuoteStore.getState();
    store.mergeGuestIntoUserBucket(uid);
    store.setActiveUserId(uid);
    loginTransitionReadyUidRef.current = uid;
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.id) return;
    loginTransitionReadyUidRef.current = null;
    useQuoteStore.getState().setActiveUserId(null);
  }, [authLoading, user?.id]);

  const addItem = useCallback((input: Omit<CartItem, "id"> & { id?: string }) => {
    useQuoteStore.getState().addItem(input);
  }, []);

  const removeItem = useCallback((id: string) => {
    useQuoteStore.getState().removeItem(id);
  }, []);

  const updateItemQty = useCallback((id: string, qty: number) => {
    useQuoteStore.getState().updateItemQty(id, qty);
  }, []);

  const clear = useCallback(() => {
    useQuoteStore.getState().clear();
  }, []);

  const open = useCallback(() => {
    setNdisPanelOpen(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setNdisPanelOpen(false);
  }, []);

  const openNdisPanel = useCallback(() => {
    setNdisPanelOpen(true);
    setIsOpen(true);
  }, []);

  const closeNdisPanel = useCallback(() => {
    setNdisPanelOpen(false);
  }, []);

  const total = useMemo(() => getQuoteSubtotal(items), [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  const value = useMemo(
    () => ({
      items,
      isOpen,
      ndisPanelOpen,
      open,
      close,
      openNdisPanel,
      closeNdisPanel,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      total,
      itemCount,
    }),
    [
      items,
      isOpen,
      ndisPanelOpen,
      open,
      close,
      openNdisPanel,
      closeNdisPanel,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      total,
      itemCount,
    ],
  );

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

export function useQuote(): QuoteState {
  const ctx = useContext(QuoteContext);
  if (!ctx) throw new Error("useQuote must be used within QuoteProvider");
  return ctx;
}
