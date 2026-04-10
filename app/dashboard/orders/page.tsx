"use client";

import { useOrdersInfinite, type Order, type OrdersListFilters } from "@/hooks/useOrders";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import CancelOrderModal from "@/components/dashboard/CancelOrderModal";
import OrderStatusBadge from "@/components/dashboard/OrderStatusBadge";

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "on-hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
];

export default function DashboardOrders() {
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const listFilters = useMemo<OrdersListFilters>(
    () => ({
      status: statusFilter,
      dateFrom,
      dateTo,
      search: debouncedSearch,
    }),
    [statusFilter, dateFrom, dateTo, debouncedSearch],
  );

  const {
    orders,
    totalFromApi,
    isPending,
    isFetching,
    isFetchingNextPage,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
  } = useOrdersInfinite(listFilters);

  const { success, error: showError } = useToast();
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [payingOrderKey, setPayingOrderKey] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const hasActiveFilters = Boolean(
    statusFilter || dateFrom || dateTo || debouncedSearch.trim(),
  );

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || isFetchingNextPage) return;
        void fetchNextPage();
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, orders.length]);

  const initiatePayment = useCallback(
    async (order: Order) => {
      const key = String(order.order_number ?? order.id);
      setPayingOrderKey(key);
      try {
        const response = await fetch(`/api/dashboard/orders/${order.order_number}/pay`, {
          method: "POST",
          credentials: "include",
        });
        if (response.ok) {
          const data = (await response.json()) as { payment_url?: string };
          if (data.payment_url) {
            window.location.href = data.payment_url;
          } else {
            success("Payment initiated successfully");
            refetch();
          }
        } else {
          const errBody = (await response.json().catch(() => ({}))) as { error?: string };
          showError(errBody.error || "Failed to initiate payment");
        }
      } catch {
        showError("Failed to initiate payment");
      } finally {
        setPayingOrderKey(null);
      }
    },
    [refetch, showError, success],
  );

  const clearFilters = useCallback(() => {
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
  }, []);

  const showListRefetchSpinner =
    isFetching && !isFetchingNextPage && orders.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-600 mt-1">View and track your order history</p>
      </div>

      <OrdersFiltersBar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onClear={clearFilters}
        showClear={hasActiveFilters}
        isRefetching={showListRefetchSpinner}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">Error loading orders: {error.message}</p>
        </div>
      )}

      {!error && isPending && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-teal-600" />
          <p className="mt-4 text-gray-600">Loading orders…</p>
        </div>
      )}

      {!error && !isPending && orders.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50/80">
          <span className="text-5xl mb-3 block" aria-hidden>
            📦
          </span>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {hasActiveFilters ? "No orders match your filters" : "No orders yet"}
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {hasActiveFilters
              ? "Try adjusting status, dates, or search."
              : "Start shopping to see your orders here."}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-block px-5 py-2 text-sm font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
            >
              Clear filters
            </button>
          ) : (
            <Link
              href="/shop"
              className="inline-block px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Start shopping
            </Link>
          )}
        </div>
      )}

      {!error && orders.length > 0 && (
        <>
          {totalFromApi != null && (
            <p className="text-sm text-gray-600">
              Showing {orders.length}
              {totalFromApi > orders.length ? ` of ${totalFromApi}` : ""} order
              {totalFromApi === 1 ? "" : "s"}
              {showListRefetchSpinner ? " · Updating…" : ""}
            </p>
          )}

          <div
            className={`space-y-3 transition-opacity ${showListRefetchSpinner ? "opacity-70" : "opacity-100"}`}
          >
            {orders.map((order) => {
              const statusNorm = String(order.status || "").toLowerCase();
              const canPay = statusNorm === "pending" || statusNorm === "failed";
              const payLabel = statusNorm === "failed" ? "Retry payment" : "Pay now";
              const payBusy = payingOrderKey === String(order.order_number ?? order.id);

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-start gap-x-8 gap-y-3 flex-1 min-w-0">
                      <div>
                        <p className="text-xs text-gray-500">Order #</p>
                        <p className="text-base font-semibold text-gray-900">{order.order_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(order.date_created).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="text-base font-semibold text-gray-900">
                          {order.currency} {order.total}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-gray-500">Status</p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {order.status === "processing" && (
                        <button
                          type="button"
                          onClick={() => setCancelOrderId(order.id)}
                          disabled={isCancelling}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      {canPay && (
                        <button
                          type="button"
                          onClick={() => void initiatePayment(order)}
                          disabled={payBusy}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-60"
                        >
                          {payBusy ? "Please wait…" : payLabel}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/orders/${order.order_number}`}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center py-4">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600" />
                Loading more…
              </div>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="text-sm font-medium text-teal-800 hover:text-teal-950 underline-offset-2 hover:underline"
              >
                Load more
              </button>
            ) : (
              <span className="text-xs text-gray-400">End of list</span>
            )}
          </div>
        </>
      )}

      {cancelOrderId && (
        <CancelOrderModal
          orderId={cancelOrderId}
          onClose={() => setCancelOrderId(null)}
          onSuccess={() => {
            setCancelOrderId(null);
            refetch();
            success("Order cancelled successfully");
          }}
        />
      )}
    </div>
  );
}

function OrdersFiltersBar({
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  searchInput,
  setSearchInput,
  onClear,
  showClear,
  isRefetching,
}: {
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  onClear: () => void;
  showClear: boolean;
  isRefetching: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>

        <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>

        <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Order #, email, name…"
            autoComplete="off"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 lg:pb-0.5">
          {showClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
          {isRefetching && (
            <span
              className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600"
              aria-label="Refreshing"
            />
          )}
        </div>
      </div>
    </div>
  );
}
