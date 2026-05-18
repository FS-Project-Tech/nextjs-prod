"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getOrderPaymentMethodDisplay } from "@/lib/checkout/paymentDisplay";
import { formatDateDdMmYyyy } from "@/lib/format-dates";
import TrackOrderButton from "@/components/dashboard/TrackOrderButton";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  /** Unit price (ex line total). */
  price: string;
  /** WooCommerce line `total` / `subtotal` — use for display when present. */
  line_total?: string;
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
  source?: "woo" | "legacy";
  machship_tracking_token?: string;
}

function formatMoney(currency: string, amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toFixed(2)}`;
}

function lineDisplayAmount(item: OrderItem): string {
  if (item.line_total != null && String(item.line_total).trim() !== "") {
    return String(item.line_total);
  }
  const unit = parseFloat(item.price);
  const qty = item.quantity;
  if (Number.isFinite(unit)) return (unit * qty).toFixed(2);
  return item.price;
}

function hasShippingContent(s: Order["shipping"]): boolean {
  const parts = [
    s.first_name,
    s.last_name,
    s.address_1,
    s.city,
    s.state,
    s.postcode,
  ].map((x) => String(x || "").trim());
  return parts.some(Boolean);
}

export default function OrderDetailPage() {
  const params = useParams();
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
        const response = await fetch(
          `/api/dashboard/orders/${encodeURIComponent(orderId)}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          throw new Error("Please sign in to view this order");
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Failed to fetch order");
        }

        const data = (await response.json()) as { order: Order };
        setOrder(data.order);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    void fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
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

  const statusLabel = String(order.status || "")
    .replace(/-/g, " ")
    .replace(/_/g, " ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex flex-col items-end gap-2 shrink-0">
          {order.machship_tracking_token ? (
            <TrackOrderButton
              trackingToken={order.machship_tracking_token}
              showToken
            />
          ) : null}
          <span
            className={`inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize ${
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
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight text-gray-900">Order Items</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {order.line_items.length}{" "}
                {order.line_items.length === 1 ? "item" : "items"} in this order
              </p>
            </div>
            <div className="divide-y divide-gray-100 px-2 sm:px-0">
              {order.line_items.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500">
                  No line items returned for this order.
                </p>
              ) : (
                order.line_items.map((item) => (
                  <div
                    key={item.id || `${item.name}-${item.quantity}`}
                    className="flex gap-4 px-4 py-5 sm:gap-5 sm:px-5"
                  >
                    <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-inset ring-gray-200/60 sm:h-24 sm:w-24">
                      {item.image?.src ? (
                        <Image
                          src={item.image.src}
                          alt={item.image.alt || item.name}
                          fill
                          sizes="(max-width: 640px) 72px, 96px"
                          className="object-cover"
                          unoptimized={
                            item.image.src.includes("localhost") ||
                            item.image.src.endsWith(".svg")
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            No image
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3 sm:gap-6">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold leading-snug text-gray-900 sm:text-base">
                          {item.name}
                        </h3>
                        {item.sku ? (
                          <p className="mt-1.5 text-sm text-gray-500">
                            <span className="text-gray-400">SKU</span>{" "}
                            <span className="font-medium text-gray-600">{item.sku}</span>
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm text-gray-600">
                          Quantity: <span className="font-medium text-gray-800">{item.quantity}</span>
                        </p>
                      </div>
                      <p className="shrink-0 pt-0.5 text-right text-base font-semibold tabular-nums text-gray-900 sm:text-[17px]">
                        {formatMoney(order.currency, lineDisplayAmount(item))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight text-gray-900 mb-4">Order Summary</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Order Date</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {formatDateDdMmYyyy(order.date_created)}
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
                    {order.shipping_lines.map((s) => s.method_title).filter(Boolean).join(", ") ||
                      "—"}
                  </dd>
                </div>
              )}
              <div className="pt-3 border-t">
                <dt className="text-sm text-gray-500">Total</dt>
                <dd className="text-xl font-bold text-gray-900">
                  {formatMoney(order.currency, order.total)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight text-gray-900 mb-4">Billing Address</h2>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-medium">
                {order.billing.first_name} {order.billing.last_name}
              </p>
              <p>{order.billing.address_1}</p>
              {order.billing.address_2 ? <p>{order.billing.address_2}</p> : null}
              <p>
                {order.billing.city}, {order.billing.state} {order.billing.postcode}
              </p>
              <p>{order.billing.country}</p>
              {order.billing.phone ? (
                <p className="mt-2">Phone: {order.billing.phone}</p>
              ) : null}
              {order.billing.email ? <p>Email: {order.billing.email}</p> : null}
            </div>
          </div>

          {hasShippingContent(order.shipping) && (
            <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm p-5 sm:p-6">
              <h2 className="text-base font-semibold tracking-tight text-gray-900 mb-4">Shipping Address</h2>
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-medium">
                  {order.shipping.first_name} {order.shipping.last_name}
                </p>
                <p>{order.shipping.address_1}</p>
                {order.shipping.address_2 ? <p>{order.shipping.address_2}</p> : null}
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
