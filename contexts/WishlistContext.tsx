// "use client";

// import React, {
//   createContext,
//   useContext,
//   useState,
//   useEffect,
//   useCallback,
//   useMemo,
//   useRef,
//   ReactNode,
// } from 'react';
// import { useUser } from '@/hooks/useUser';
// import { useToast } from '@/components/ToastProvider';
// import type {
//   WishlistContextType,
//   WishlistProduct,
//   WISHLIST_COOKIE_NAME,
// } from '@/lib/types/wishlist';

// /**
//  * Create Wishlist Context
//  */
// const WishlistContext = createContext<WishlistContextType | null>(null);

// /** Cookie for logged-in user wishlist */
// const USER_COOKIE_NAME = 'wishlist_items';
// /** Cookie for guest wishlist (only shown when logged out) */
// const GUEST_COOKIE_NAME = 'wishlist_items_guest';

// /**
//  * Get wishlist from a cookie by name
//  */
// function getWishlistFromCookie(cookieName: string): number[] {
//   if (typeof window === 'undefined') return [];
//   try {
//     const cookies = document.cookie.split(';');
//     const wishlistCookie = cookies.find(c => c.trim().startsWith(`${cookieName}=`));
//     if (!wishlistCookie) return [];
//     const value = wishlistCookie.split('=')[1];
//     if (!value) return [];
//     const decoded = decodeURIComponent(value);
//     const parsed = JSON.parse(decoded);
//     if (Array.isArray(parsed)) {
//       return parsed.filter((id): id is number => typeof id === 'number' && id > 0);
//     }
//     return [];
//   } catch {
//     return [];
//   }
// }

// /**
//  * Save wishlist to a cookie by name
//  */
// function saveWishlistToCookie(wishlist: number[], cookieName: string): void {
//   if (typeof window === 'undefined') return;
//   try {
//     const value = JSON.stringify(wishlist);
//     const encoded = encodeURIComponent(value);
//     const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
//     const isSecure = window.location.protocol === 'https:';
//     document.cookie = `${cookieName}=${encoded}; expires=${expires}; path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;
//   } catch (error) {
//     console.error('Failed to save wishlist to cookie:', error);
//   }
// }

// /** Which cookie to use for current mode (user vs guest) */
// // function getActiveCookieName(isAuthenticated: boolean): string {
// //   return isAuthenticated ? USER_COOKIE_NAME : GUEST_COOKIE_NAME;
// // }

// function getActiveCookieName(
//   isAuthenticated: boolean,
//   userId?: number | string
// ): string {
//   if (isAuthenticated && userId !== undefined && userId !== null) {
//     return `${USER_COOKIE_NAME}_${userId}`;
//   }

//   // while auth loading, avoid guest overwrite
//   if (isAuthenticated && !userId) {
//     return USER_COOKIE_NAME; // temporary safe fallback
//   }

//   return GUEST_COOKIE_NAME;
// }

// /**
//  * WishlistProvider Props
//  */
// interface WishlistProviderProps {
//   children: ReactNode;
// }

// /**
//  * WishlistProvider Component
//  * Manages wishlist state with authentication awareness
//  */
// export function WishlistProvider({ children }: WishlistProviderProps) {
//   // const { isAuthenticated, loading: authLoading } = useUser();
//   const { isAuthenticated, loading: authLoading, user } = useUser();
//   const { success, error: showError } = useToast();

//   // State
//   const [items, setItems] = useState<number[]>([]);
//   const [products, setProducts] = useState<WishlistProduct[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [isLoadingProducts, setIsLoadingProducts] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [isMounted, setIsMounted] = useState(false);
//   const wasAuthenticatedRef = useRef<boolean | undefined>(undefined);

//   /**
//    * Load wishlist.
//    * - Logged-in: fetch from WordPress via /api/wishlist (same list on any browser/device).
//    * - Guest: use guest cookie only (per-browser).
//    */
//   const loadWishlist = useCallback(async () => {
//     if (!isMounted) return;
//     setIsLoading(true);
//     setError(null);
//     try {
//       if (isAuthenticated) {
//         try {
//           const response = await fetch('/api/wishlist', {
//             method: 'GET',
//             credentials: 'include',
//             cache: 'no-store',
//           });
//           if (response.ok) {
//             const data = await response.json();
//             const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
//             const serverItems = rawItems.filter(
//               (id: unknown): id is number =>
//                 typeof id === 'number' && Number.isFinite(id) && id > 0,
//             );
//             setItems(serverItems);
//             const cookieName = getActiveCookieName(true, user?.id);
//             saveWishlistToCookie(serverItems, cookieName);
//             return;
//           }
//         } catch (err) {
//           console.error('Failed to load wishlist from API, falling back to cookie:', err);
//         }
//       }
//       const cookieName = getActiveCookieName(isAuthenticated, user?.id);
//       const cookieItems = getWishlistFromCookie(cookieName);
//       setItems(cookieItems);
//     } catch (err) {
//       console.error('Failed to load wishlist:', err);
//       setError('Failed to load wishlist');
//     } finally {
//       setIsLoading(false);
//     }
//   }, [isMounted, isAuthenticated, user?.id]);

//   /**
//    * Load product details for wishlist items
//    */
//   const loadProducts = useCallback(async () => {
//     if (items.length === 0) {
//       setProducts([]);
//       return;
//     }

//     setIsLoadingProducts(true);

//     try {
//       const response = await fetch(
//         `/api/products?include=${items.join(',')}&per_page=${items.length}`,
//         { cache: 'no-store' }
//       );

//       if (response.ok) {
//         const data = await response.json();
//         const productsList = data.products || data || [];

//         if (Array.isArray(productsList)) {
//           // Filter to only include products in wishlist and maintain order
//           const filtered = items
//             .map(id => productsList.find((p: WishlistProduct) => p.id === id))
//             .filter((p): p is WishlistProduct => p !== undefined);

//           setProducts(filtered);
//         }
//       }
//     } catch (err) {
//       console.error('Failed to load wishlist products:', err);
//     } finally {
//       setIsLoadingProducts(false);
//     }
//   }, [items]);

//   // Initialize on mount
//   useEffect(() => {
//     setIsMounted(true);
//   }, []);

//   // On logout: clear UI state so we don't show user's list; loadWishlist will then load guest list (don't clear user cookie)
//   useEffect(() => {
//     if (!isMounted || authLoading) return;
//     const wasAuthenticated = wasAuthenticatedRef.current;
//     if (wasAuthenticated === true && !isAuthenticated) {
//       setItems([]);
//       setProducts([]);
//     }
//     wasAuthenticatedRef.current = isAuthenticated;
//   }, [isMounted, authLoading, isAuthenticated]);

//   // Load wishlist when mounted or auth changes (logged-in = from cookie; guest = empty)
//   useEffect(() => {
//     if (isMounted && !authLoading) {
//       loadWishlist();
//     }
//   }, [isMounted, authLoading, isAuthenticated, loadWishlist]);

//   // Load products when items change
//   useEffect(() => {
//     if (isMounted && items.length > 0) {
//       loadProducts();
//     } else if (isMounted) {
//       setProducts([]);
//     }
//   }, [items, isMounted, loadProducts]);

//   /**
//    * Check if product is in wishlist
//    */
//   const isInWishlist = useCallback((productId: number): boolean => {
//     return items.includes(productId);
//   }, [items]);

//   /**
//    * Add product to wishlist.
//    * - Logged-in: call /api/wishlist (POST) so wishlist is stored in WordPress (any browser).
//    * - Guest: update guest cookie only.
//    */
//   const addToWishlist = useCallback(
//     async (productId: number): Promise<boolean> => {
//       try {
//         if (isAuthenticated) {
//           const response = await fetch('/api/wishlist', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             credentials: 'include',
//             body: JSON.stringify({ productId }),
//           });
//           if (response.status === 401) {
//             showError('Please log in to use the wishlist.');
//             return false;
//           }
//           if (!response.ok) {
//             const data = await response.json().catch(() => ({}));
//             showError((data && data.error) || 'Failed to add to wishlist');
//             return false;
//           }
//           const data = await response.json();
//           const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
//           const serverItems = rawItems.filter(
//             (id: unknown): id is number =>
//               typeof id === 'number' && Number.isFinite(id) && id > 0,
//           );
//           setItems(serverItems);
//           saveWishlistToCookie(serverItems, getActiveCookieName(true, user?.id));
//         } else {
//           if (!items.includes(productId)) {
//             const updatedItems = [...items, productId];
//             setItems(updatedItems);
//             saveWishlistToCookie(updatedItems, GUEST_COOKIE_NAME);
//           }
//         }
//         success('Added to wishlist');
//         return true;
//       } catch (err) {
//         console.error('Failed to add to wishlist:', err);
//         showError('Failed to add to wishlist');
//         return false;
//       }
//     },
//     [isAuthenticated, user?.id, items, success, showError],
//   );

//   /**
//    * Remove product from wishlist.
//    * - Logged-in: call /api/wishlist (DELETE) so WordPress wishlist is updated.
//    * - Guest: update guest cookie only.
//    */
//   const removeFromWishlist = useCallback(
//     async (productId: number): Promise<boolean> => {
//       try {
//         if (isAuthenticated) {
//           const response = await fetch('/api/wishlist', {
//             method: 'DELETE',
//             headers: { 'Content-Type': 'application/json' },
//             credentials: 'include',
//             body: JSON.stringify({ productId }),
//           });
//           if (response.status === 401) {
//             showError('Please log in to use the wishlist.');
//             return false;
//           }
//           if (!response.ok) {
//             const data = await response.json().catch(() => ({}));
//             showError((data && data.error) || 'Failed to remove from wishlist');
//             return false;
//           }
//           const data = await response.json();
//           const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
//           const serverItems = rawItems.filter(
//             (id: unknown): id is number =>
//               typeof id === 'number' && Number.isFinite(id) && id > 0,
//           );
//           setItems(serverItems);
//           saveWishlistToCookie(serverItems, getActiveCookieName(true, user?.id));
//         } else {
//           const updatedItems = items.filter((id) => id !== productId);
//           setItems(updatedItems);
//           saveWishlistToCookie(updatedItems, GUEST_COOKIE_NAME);
//         }
//         setProducts((prev) => prev.filter((p) => p.id !== productId));
//         success('Removed from wishlist');
//         return true;
//       } catch (err) {
//         console.error('Failed to remove from wishlist:', err);
//         showError('Failed to remove from wishlist');
//         return false;
//       }
//     },
//     [isAuthenticated, user?.id, items, success, showError],
//   );

//   /**
//    * Refresh wishlist from server
//    */
//   const refreshWishlist = useCallback(async () => {
//     await loadWishlist();
//     await loadProducts();
//   }, [loadWishlist, loadProducts]);

//   /**
//    * Clear wishlist (clears current user or guest list)
//    */
//   const clearWishlist = useCallback(() => {
//     setItems([]);
//     setProducts([]);
//     const cookieName = getActiveCookieName(
//   isAuthenticated,
//   user?.id
// );
//     saveWishlistToCookie([], cookieName);
//   }, [isAuthenticated, user?.id]);

//   // Context value
//   const value = useMemo<WishlistContextType>(() => ({
//     items: isMounted ? items : [],
//     products: isMounted ? products : [],
//     isLoading,
//     isLoadingProducts,
//     error,
//     addToWishlist,
//     removeFromWishlist,
//     isInWishlist,
//     refreshWishlist,
//     clearWishlist,
//   }), [
//     isMounted,
//     items,
//     products,
//     isLoading,
//     isLoadingProducts,
//     error,
//     addToWishlist,
//     removeFromWishlist,
//     isInWishlist,
//     refreshWishlist,
//     clearWishlist,
//   ]);

//   return (
//     <WishlistContext.Provider value={value}>
//       {children}
//     </WishlistContext.Provider>
//   );
// }

// /**
//  * useWishlist Hook
//  * Access wishlist context
//  */
// export function useWishlist(): WishlistContextType {
//   const context = useContext(WishlistContext);

//   if (!context) {
//     throw new Error('useWishlist must be used within a WishlistProvider');
//   }

//   return context;
// }

// /**
//  * Export default
//  */
// export default WishlistProvider;

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/ToastProvider";
import type { WishlistContextType, WishlistProduct } from "@/lib/types/wishlist";

/**
 * Create Wishlist Context
 */
const WishlistContext = createContext<WishlistContextType | null>(null);

/** Cookie for logged-in user wishlist */
const USER_COOKIE_NAME = "wishlist_items";
/** Cookie for guest wishlist (only shown when logged out) */
const GUEST_COOKIE_NAME = "wishlist_items_guest";

/** Normalize wishlist IDs from API, cookies, or JSON (handles string IDs from WordPress). */
function normalizeWishlistIds(raw: unknown[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of raw) {
    const n =
      typeof entry === "number"
        ? entry
        : typeof entry === "string"
          ? parseInt(entry, 10)
          : Number(entry);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Get wishlist from a cookie by name
 */
function getWishlistFromCookie(cookieName: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const cookies = document.cookie.split(";");
    const wishlistCookie = cookies.find((c) => c.trim().startsWith(`${cookieName}=`));
    if (!wishlistCookie) return [];
    const value = wishlistCookie.split("=")[1];
    if (!value) return [];
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return normalizeWishlistIds(parsed);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Save wishlist to a cookie by name
 */
function saveWishlistToCookie(wishlist: number[], cookieName: string): void {
  if (typeof window === "undefined") return;
  try {
    const value = JSON.stringify(wishlist);
    const encoded = encodeURIComponent(value);
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    const isSecure = window.location.protocol === "https:";
    document.cookie = `${cookieName}=${encoded}; expires=${expires}; path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;
  } catch (error) {
    console.error("Failed to save wishlist to cookie:", error);
  }
}

/** Which cookie to use for current mode (user vs guest) */
// function getActiveCookieName(isAuthenticated: boolean): string {
//   return isAuthenticated ? USER_COOKIE_NAME : GUEST_COOKIE_NAME;
// }

function getActiveCookieName(isAuthenticated: boolean, userId?: number | string): string {
  if (isAuthenticated && userId !== undefined && userId !== null) {
    return `${USER_COOKIE_NAME}_${userId}`;
  }

  // while auth loading, avoid guest overwrite
  if (isAuthenticated && !userId) {
    return USER_COOKIE_NAME; // temporary safe fallback
  }

  return GUEST_COOKIE_NAME;
}

/**
 * WishlistProvider Props
 */
interface WishlistProviderProps {
  children: ReactNode;
}

/**
 * WishlistProvider Component
 * Manages wishlist state with authentication awareness
 */
export function WishlistProvider({ children }: WishlistProviderProps) {
  // const { isAuthenticated, loading: authLoading } = useUser();
  const { isAuthenticated, loading: authLoading, user } = useUser();
  const { success, error: showError } = useToast();

  // State
  const [items, setItems] = useState<number[]>([]);
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const wasAuthenticatedRef = useRef<boolean | undefined>(undefined);

  /**
   * Load wishlist.
   * - Logged-in: fetch from WordPress via /api/wishlist (same list on any browser/device).
   * - Guest: use guest cookie only (per-browser).
   */
  const loadWishlist = useCallback(async () => {
    if (!isMounted) return;
    setIsLoading(true);
    setError(null);
    try {
      if (isAuthenticated) {
        try {
          const response = await fetch("/api/wishlist", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
            const serverItems = normalizeWishlistIds(rawItems);
            setItems(serverItems);
            const cookieName = getActiveCookieName(true, user?.id);
            saveWishlistToCookie(serverItems, cookieName);
            return;
          }
        } catch (err) {
          console.error("Failed to load wishlist from API, falling back to cookie:", err);
        }
      }
      const cookieName = getActiveCookieName(isAuthenticated, user?.id);
      const cookieItems = getWishlistFromCookie(cookieName);
      setItems(cookieItems);
    } catch (err) {
      console.error("Failed to load wishlist:", err);
      setError("Failed to load wishlist");
    } finally {
      setIsLoading(false);
    }
  }, [isMounted, isAuthenticated, user?.id]);

  /**
   * Load product details for wishlist items
   */
  const loadProducts = useCallback(async () => {
    if (items.length === 0) {
      setProducts([]);
      return;
    }

    setIsLoadingProducts(true);

    try {
      const response = await fetch(
        `/api/products?include=${items.join(",")}&per_page=${items.length}`,
        { cache: "no-store" }
      );

      if (response.ok) {
        const data = await response.json();
        const productsList = data.products || data || [];

        if (Array.isArray(productsList)) {
          // Filter to only include products in wishlist and maintain order
          const filtered = items
            .map((id) => productsList.find((p: WishlistProduct) => p.id === id))
            .filter((p): p is WishlistProduct => p !== undefined);

          setProducts(filtered);
        }
      }
    } catch (err) {
      console.error("Failed to load wishlist products:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [items]);

  // Initialize on mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // On logout: clear UI state so we don't show user's list; loadWishlist will then load guest list (don't clear user cookie)
  useEffect(() => {
    if (!isMounted || authLoading) return;
    const wasAuthenticated = wasAuthenticatedRef.current;
    if (wasAuthenticated === true && !isAuthenticated) {
      setItems([]);
      setProducts([]);
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isMounted, authLoading, isAuthenticated]);

  // Load wishlist when mounted or auth changes (logged-in = from cookie; guest = empty)
  useEffect(() => {
    if (isMounted && !authLoading) {
      loadWishlist();
    }
  }, [isMounted, authLoading, isAuthenticated, loadWishlist]);

  // Load products when items change
  useEffect(() => {
    if (isMounted && items.length > 0) {
      loadProducts();
    } else if (isMounted) {
      setProducts([]);
    }
  }, [items, isMounted, loadProducts]);

  /**
   * Check if product is in wishlist
   */
  const isInWishlist = useCallback(
    (productId: number): boolean => {
      return items.includes(productId);
    },
    [items]
  );

  /**
   * Add product to wishlist.
   * - Logged-in: call /api/wishlist (POST) so wishlist is stored in WordPress (any browser).
   * - Guest: update guest cookie only.
   */
  const addToWishlist = useCallback(
    async (productid: number): Promise<boolean> => {
      try {
        if (isAuthenticated) {
          const response = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            // body: JSON.stringify({ productid }),
            body: JSON.stringify({ productId: productid }),
          });
          if (response.status === 401) {
            showError("Please log in to use the wishlist.");
            return false;
          }
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showError((data && data.error) || "Failed to add to wishlist");
            return false;
          }
          const data = await response.json();
          const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
          const serverItems = normalizeWishlistIds(rawItems);
          setItems(serverItems);
          saveWishlistToCookie(serverItems, getActiveCookieName(true, user?.id));
        } else {
          if (!items.includes(productid)) {
            const updatedItems = [...items, productid];
            setItems(updatedItems);
            saveWishlistToCookie(updatedItems, GUEST_COOKIE_NAME);
          }
        }
        success("Added to wishlist");
        return true;
      } catch (err) {
        console.error("Failed to add to wishlist:", err);
        showError("Failed to add to wishlist");
        return false;
      }
    },
    [isAuthenticated, user?.id, items, success, showError]
  );

  /**
   * Remove product from wishlist.
   * - Logged-in: call /api/wishlist (DELETE) so WordPress wishlist is updated.
   * - Guest: update guest cookie only.
   */
  const removeFromWishlist = useCallback(
    async (productId: number): Promise<boolean> => {
      try {
        if (isAuthenticated) {
          const response = await fetch("/api/wishlist", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ productId }),
          });
          if (response.status === 401) {
            showError("Please log in to use the wishlist.");
            return false;
          }
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showError((data && data.error) || "Failed to remove from wishlist");
            return false;
          }
          const data = await response.json();
          const rawItems = Array.isArray(data.wishlist) ? data.wishlist : [];
          const serverItems = normalizeWishlistIds(rawItems);
          setItems(serverItems);
          saveWishlistToCookie(serverItems, getActiveCookieName(true, user?.id));
        } else {
          const updatedItems = items.filter((id) => id !== productId);
          setItems(updatedItems);
          saveWishlistToCookie(updatedItems, GUEST_COOKIE_NAME);
        }
        setProducts((prev) => prev.filter((p) => p.id !== productId));
        success("Removed from wishlist");
        return true;
      } catch (err) {
        console.error("Failed to remove from wishlist:", err);
        showError("Failed to remove from wishlist");
        return false;
      }
    },
    [isAuthenticated, user?.id, items, success, showError]
  );

  /**
   * Refresh wishlist from server
   */
  const refreshWishlist = useCallback(async () => {
    await loadWishlist();
    await loadProducts();
  }, [loadWishlist, loadProducts]);

  /**
   * Clear wishlist (clears current user or guest list)
   */
  const clearWishlist = useCallback(() => {
    setItems([]);
    setProducts([]);
    const cookieName = getActiveCookieName(isAuthenticated, user?.id);
    saveWishlistToCookie([], cookieName);
  }, [isAuthenticated, user?.id]);

  // Context value
  const value = useMemo<WishlistContextType>(
    () => ({
      items: isMounted ? items : [],
      products: isMounted ? products : [],
      isLoading,
      isLoadingProducts,
      error,
      addToWishlist,
      removeFromWishlist,
      isInWishlist,
      refreshWishlist,
      clearWishlist,
    }),
    [
      isMounted,
      items,
      products,
      isLoading,
      isLoadingProducts,
      error,
      addToWishlist,
      removeFromWishlist,
      isInWishlist,
      refreshWishlist,
      clearWishlist,
    ]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

/**
 * useWishlist Hook
 * Access wishlist context
 */
export function useWishlist(): WishlistContextType {
  const context = useContext(WishlistContext);

  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }

  return context;
}

/**
 * Export default
 */
export default WishlistProvider;
