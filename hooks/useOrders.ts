"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

/** Dashboard orders list page size (must match API `per_page`). */
export const DASHBOARD_ORDERS_PER_PAGE = 5;

export interface Order {
  id: number;
  order_number: string | number;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  line_items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: string;
    product_id: number;
    variation_id?: number;
    image?: string;
    /** Product or variation SKU when provided by WooCommerce / legacy API */
    sku?: string;
  }>;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  /** MachShip consignment token from `_wc_ns_machship_tracking_token` when present. */
  machship_tracking_token?: string;
}

export interface PaginationInfo {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export type OrdersListFilters = {
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  /** Match orders where billing or shipping first + last name equals these (case-insensitive). Both empty = no name filter. */
  firstName: string;
  lastName: string;
};

type OrdersPagePayload = {
  orders: Order[];
  pagination: PaginationInfo | null;
};

/**
 * Paginated orders (fixed page size). Resets to page 1 when filters change.
 */
export function useOrdersInfinite(filters: OrdersListFilters) {
  const [page, setPage] = useState(1);
  const perPage = DASHBOARD_ORDERS_PER_PAGE;

  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.dateFrom, filters.dateTo, filters.search, filters.firstName, filters.lastName]);

  const query = useQuery({
    queryKey: [
      "orders",
      "paged",
      page,
      perPage,
      filters.status,
      filters.dateFrom,
      filters.dateTo,
      filters.search,
      filters.firstName,
      filters.lastName,
    ],
    queryFn: async (): Promise<OrdersPagePayload> => {
      const usp = new URLSearchParams();
      usp.set("page", String(page));
      usp.set("per_page", String(perPage));
      const st = filters.status.trim().toLowerCase();
      if (st) usp.set("status", st);
      const df = filters.dateFrom.trim();
      const dt = filters.dateTo.trim();
      if (df) usp.set("date_from", df);
      if (dt) usp.set("date_to", dt);
      const q = filters.search.trim();
      if (q) usp.set("search", q);
      const fn = filters.firstName.trim();
      const ln = filters.lastName.trim();
      if (fn && ln) {
        usp.set("first_name", fn);
        usp.set("last_name", ln);
      }

      const response = await fetch(`/api/dashboard/orders?${usp.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const raw = await response.text();
      let result: Record<string, unknown> = {};
      if (raw) {
        try {
          result = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          throw new Error(`Failed to parse orders response (status ${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(
          (typeof result.error === "string" && result.error) ||
            `Failed to fetch orders: ${response.status}`,
        );
      }

      return {
        orders: (Array.isArray(result.orders) ? result.orders : []) as Order[],
        pagination: (result.pagination as PaginationInfo) || null,
      };
    },
    staleTime: 15 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    gcTime: 5 * 60 * 1000,
    retry: process.env.NODE_ENV === "production" ? 1 : 0,
    placeholderData: (previousData) => previousData,
  });

  const orders = query.data?.orders ?? [];
  const pagination = query.data?.pagination ?? null;
  const totalFromApi = pagination?.total ?? null;
  const totalPages = pagination?.total_pages ?? 0;

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const rangeLabel = useMemo(() => {
    if (totalFromApi == null || totalFromApi === 0) return null;
    const start = (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, totalFromApi);
    return { start, end };
  }, [page, perPage, totalFromApi]);

  return {
    orders,
    totalFromApi,
    page,
    setPage,
    totalPages,
    rangeLabel,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
