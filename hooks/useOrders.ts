"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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
};

type OrdersPagePayload = {
  orders: Order[];
  pagination: PaginationInfo | null;
};

export function useOrdersInfinite(filters: OrdersListFilters) {
  const query = useInfiniteQuery({
    queryKey: [
      "orders",
      "infinite",
      filters.status,
      filters.dateFrom,
      filters.dateTo,
      filters.search,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<OrdersPagePayload> => {
      const usp = new URLSearchParams();
      usp.set("page", String(pageParam));
      usp.set("per_page", "15");
      const st = filters.status.trim().toLowerCase();
      if (st) usp.set("status", st);
      const df = filters.dateFrom.trim();
      const dt = filters.dateTo.trim();
      if (df) usp.set("date_from", df);
      if (dt) usp.set("date_to", dt);
      const q = filters.search.trim();
      if (q) usp.set("search", q);

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
    getNextPageParam: (lastPage) => {
      const p = lastPage.pagination;
      if (!p || p.total_pages <= 0) return undefined;
      if (p.page >= p.total_pages) return undefined;
      return p.page + 1;
    },
    staleTime: 60 * 1000,
    retry: process.env.NODE_ENV === "production" ? 1 : 0,
  });

  const orders = useMemo(() => {
    const pages = query.data?.pages;
    if (!pages?.length) return [];
    return pages.flatMap((p) => p.orders);
  }, [query.data?.pages]);

  const totalFromApi = query.data?.pages?.[0]?.pagination?.total ?? null;

  return {
    orders,
    totalFromApi,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error as Error | null,
    refetch: query.refetch,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
