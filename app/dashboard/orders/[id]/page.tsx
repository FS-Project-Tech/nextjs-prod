"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getOrderPaymentMethodDisplay } from "@/lib/checkout/paymentDisplay";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: string;
  sku?: string;
  image?: { src: string; alt: string };
}

interface Order {
  id: number;
  order_number?: string;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  line_items: OrderItem[];
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  payment_method?: string;
  payment_method_title?: string;
  shipping_lines?: Array<{
    method_title: string;
    total: string;
  }>;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Order ID is required");
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch order");
        }

        const data = await response.json();
        setOrder(data.order);
      } catch (err: any) {
        setError(err.message || "Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error || "Order not found"}</p>
        <Link
          href="/dashboard/orders"
          className="mt-4 inline-block text-sm text-red-600 hover:text-red-700"
        >
          ← Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/orders"
            className="text-sm text-gray-600 hover:text-gray-900 mb-2 inline-block"
          >
            ← Back to Orders
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
          <p className="text-gray-600 mt-1">Order #{order.order_number || order.id}</p>
        </div>
        <span
          className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.line_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                    {item.image?.src ? (
                      <Image
                        src={item.image.src}
                        alt={item.image.alt || item.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xs text-gray-600">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    {item.sku && <p className="text-xs text-gray-500 mt-1">SKU: {item.sku}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                      <p className="font-semibold text-gray-900">
                        {order.currency} {(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Order Date</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {new Date(order.date_created).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              {(order.payment_method || order.payment_method_title) && (
                <div>
                  <dt className="text-sm text-gray-500">Payment Method</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {getOrderPaymentMethodDisplay(order)}
                  </dd>
                </div>
              )}
              {order.shipping_lines && order.shipping_lines.length > 0 && (
                <div>
                  <dt className="text-sm text-gray-500">Shipping Method</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {order.shipping_lines[0].method_title}
                  </dd>
                </div>
              )}
              <div className="pt-3 border-t">
                <dt className="text-sm text-gray-500">Total</dt>
                <dd className="text-xl font-bold text-gray-900">
                  {order.currency} {order.total}
                </dd>
              </div>
            </dl>
          </div>

          {/* Billing Address */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing Address</h2>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-medium">
                {order.billing.first_name} {order.billing.last_name}
              </p>
              <p>{order.billing.address_1}</p>
              {order.billing.address_2 && <p>{order.billing.address_2}</p>}
              <p>
                {order.billing.city}, {order.billing.state} {order.billing.postcode}
              </p>
              <p>{order.billing.country}</p>
              {order.billing.phone && <p className="mt-2">Phone: {order.billing.phone}</p>}
              {order.billing.email && <p>Email: {order.billing.email}</p>}
            </div>
          </div>

          {/* Shipping Address */}
          {order.shipping && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Address</h2>
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-medium">
                  {order.shipping.first_name} {order.shipping.last_name}
                </p>
                <p>{order.shipping.address_1}</p>
                {order.shipping.address_2 && <p>{order.shipping.address_2}</p>}
                <p>
                  {order.shipping.city}, {order.shipping.state} {order.shipping.postcode}
                </p>
                <p>{order.shipping.country}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
