import { useEffect } from "react";

/**
 * Custom hook to track viewed products in localStorage
 */
export function useViewedProduct(productId: number, categoryIds: number[]) {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const key = "_viewed_products";
      const raw = window.localStorage.getItem(key);
      const list: Array<{ id: number; cats: number[] }> = raw
        ? JSON.parse(raw)
        : [];
      const next = [
        { id: productId, cats: categoryIds },
        ...list.filter((x) => x.id !== productId),
      ].slice(0, 20);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }, [productId, categoryIds]);
}

