"use client";

import { useOrders } from "@/hooks/useOrders";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import CancelOrderModal from "@/components/dashboard/CancelOrderModal";

export default function DashboardOrders() {
  const [currentPage, setCurrentPage] = useState(1);
  const { orders, pagination, isLoading, error, refetch } = useOrders(currentPage);
  const { success, error: showError } = useToast();
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading orders: {error.message}</p>
      </div>
    );
  }

  if (!isLoading && orders.length === 0 && (!pagination || pagination.total === 0)) {
    return (
      <div className="text-center py-12">
        <span className="text-6xl mb-4 block">📦</span>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
        <p className="text-gray-600 mb-6">Start shopping to see your orders here</p>
        <Link
          href="/shop"
          className="inline-block px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-600 mt-1">View and track your order history</p>
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <div
            key={order.order_number}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6 flex-1">
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
                <div>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      order.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : order.status === "processing"
                          ? "bg-blue-100 text-blue-800"
                          : order.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : order.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* Action buttons based on order status */}
                {order.status === "processing" && (
                  <button
                    onClick={() => setCancelOrderId(order.id)}
                    disabled={isCancelling}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                {order.status === "pending" && (
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(
                          `/api/dashboard/orders/${order.order_number}/pay`,
                          {
                            method: "POST",
                            credentials: "include",
                          }
                        );
                        if (response.ok) {
                          const data = await response.json();
                          if (data.payment_url) {
                            window.location.href = data.payment_url;
                          } else {
                            success("Payment initiated successfully");
                            refetch();
                          }
                        } else {
                          const error = await response.json();
                          showError(error.error || "Failed to initiate payment");
                        }
                      } catch (err: any) {
                        showError("Failed to initiate payment");
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
                  >
                    Pay Now
                  </button>
                )}
                <Link
                  href={`/dashboard/orders/${order.order_number}`}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  View Details
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-700">
            Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, pagination.total)}{" "}
            of {pagination.total} orders
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoading}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            {/* Page numbers */}
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                let pageNum;
                if (pagination.total_pages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pagination.total_pages - 2) {
                  pageNum = pagination.total_pages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    disabled={isLoading}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      currentPage === pageNum
                        ? "bg-teal-600 text-white"
                        : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(pagination.total_pages, prev + 1))}
              disabled={currentPage === pagination.total_pages || isLoading}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
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
