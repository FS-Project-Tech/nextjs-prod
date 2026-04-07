"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import Image from "next/image";
import { validateAccessToken, getStoredToken, getCartUrl } from "@/lib/access-token";
import Link from "next/link";
import ShippingOptions from "@/components/ShippingOptions";
import { useShippingAddress } from "@/hooks/useShippingAddress";
import { calculateSubtotal, calculateGST, calculateTaxableSubtotal, calculateTotal } from "@/lib/cart/pricing";
import { formatPrice, formatPriceWithLabel } from "@/lib/format-utils";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";

function CartPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { items, updateItemQty, removeItem } = useCart();
  const [coupon, setCoupon] = useState<string>("");
  const [discount, setDiscount] = useState<number>(0);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const { country: shippingCountry, zone: shippingZone } = useShippingAddress();

  // Ensure component is mounted before accessing browser APIs
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Validate access token on mount (only after client mount)
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;

    const token = searchParams.get("token") || getStoredToken();

    // Check if token is valid
    if (!validateAccessToken(token, "cart")) {
      // Redirect to home page if no valid token
      router.push("/");
      return;
    }

    // Check if cart has items
    if (items.length === 0) {
      // Redirect to shop if cart is empty
      router.push("/shop");
      return;
    }

    // Authorized - allow access
    setIsAuthorized(true);

    // Remove token from URL after validation (clean URL)

    if (searchParams.has("token")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("token");
      const cleanUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(cleanUrl);
    }
  }, [isMounted, searchParams, router, items.length, pathname]);

  const subtotal = useMemo(() => calculateSubtotal(items), [items]);
  const taxableSubtotal = useMemo(() => calculateTaxableSubtotal(items), [items]);

  const gst = useMemo(() => {
    return calculateGST(subtotal, shippingCost, discount, 0, taxableSubtotal);
  }, [subtotal, taxableSubtotal, discount, shippingCost]);

  const total = useMemo(() => {
    return calculateTotal(subtotal, shippingCost, discount, gst);
  }, [subtotal, discount, shippingCost, gst]);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    if (code === "SAVE10") {
      setDiscount(Number((subtotal * 0.1).toFixed(2)));
    } else {
      setDiscount(0);
    }
  };

  // Show loading if not mounted or not authorized
  if (!isMounted || !isAuthorized) {
    return (
      <div className="text-center">
        <div className="text-gray-600 mb-2">Redirecting...</div>
        <div className="text-sm text-gray-500">Please add items to cart first</div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold pt-4">Shopping Cart</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart Items Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Cart Items</h2>
            {items.length === 0 ? (
              <div className="py-8 text-center text-gray-600">Your cart is empty.</div>
            ) : (
              <ul className="space-y-4 divide-y">
                {items.map((i) => (
                  <li key={i.id} className="pt-4 first:pt-0">
                    <div className="flex gap-4">
                      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {i.imageUrl ? (
                          <Image
                            src={i.imageUrl}
                            alt={i.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-gray-600">
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900">{i.name}</h3>

                        {i.attributes && Object.keys(i.attributes).length > 0 && (
                          <div className="mt-1 text-sm text-gray-600">
                            <span className="font-medium">Variations: </span>
                            {Object.entries(i.attributes).map(([key, value], idx) => (
                              <span key={key}>
                                {key}: <span className="font-medium text-gray-900">{value}</span>
                                {idx < Object.entries(i.attributes || {}).length - 1 && ", "}
                              </span>
                            ))}
                          </div>
                        )}

                        {i.sku && (
                          <div className="mt-1 text-sm text-gray-600">
                            <span className="font-medium">SKU: </span>
                            <span className="text-gray-900">{i.sku}</span>
                          </div>
                        )}

                        {i.deliveryPlan && i.deliveryPlan !== "none" && (
                          <div className="mt-1 text-sm text-gray-600">
                            <span className="font-medium">Delivery: </span>
                            <span className="text-gray-900">
                              {getDeliveryFrequencyLabel(i.deliveryPlan)}
                            </span>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <label className="text-sm text-gray-600">Qty:</label>
                            <input
                              type="number"
                              min={1}
                              value={i.qty}
                              onChange={(e) =>
                                updateItemQty(i.id, Math.max(1, Number(e.target.value)))
                              }
                              className="w-20 rounded border px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="text-right">
                            {(() => {
                              const priceInfo = formatPriceWithLabel(
                                i.price,
                                i.tax_class,
                                i.tax_status
                              );
                              const totalPrice = Number(i.price || 0) * i.qty;
                              const totalInfo = formatPriceWithLabel(
                                totalPrice.toString(),
                                i.tax_class,
                                i.tax_status
                              );
                              return (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-gray-900">
                                    {totalInfo.label
                                      ? `${totalInfo.label}: ${totalInfo.price}`
                                      : totalInfo.price}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {priceInfo.label
                                      ? `${priceInfo.label}: ${priceInfo.price}`
                                      : priceInfo.price}{" "}
                                    each
                                  </div>
                                  {totalInfo.exclPrice && (
                                    <div className="text-xs text-gray-600">
                                      Excl. GST: {totalInfo.exclPrice} total
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(i.id)}
                          className="mt-2 text-sm text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl bg-white p-6">
            <h2 className="mb-2 text-sm font-medium text-gray-700">Have any discount code?</h2>
            <div className="flex gap-2">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="Enter coupon code"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={applyCoupon}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
              >
                Apply
              </button>
            </div>
            {discount > 0 && (
              <div className="mt-2 text-xs text-green-600">
                Coupon applied: ${discount.toFixed(2)} off
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-xl bg-white p-6 sticky top-4">
            <h2 className="mb-4 text-lg font-semibold">Order Summary</h2>

            <div className="mb-4 border-b pb-4">
              <ShippingOptions
                country={shippingCountry}
                zone={shippingZone}
                subtotal={subtotal}
                items={items}
                onRateChange={(rateId, rate) => setShippingCost(rate.cost)}
                showLabel={true}
              />
            </div>

            {/* Totals Section */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">{formatPrice(shippingCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">GST (10%)</span>
                <span className="font-medium">{formatPrice(gst)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-green-600">
                  <span>Discount</span>
                  <span>−{formatPrice(discount)}</span>
                </div>
              )}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            {isMounted && items.length > 0 && (
              <>
                <Link
                  href="/checkout"
                  className="mt-6 block w-full rounded-md bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-black"
                >
                  Proceed to Checkout
                </Link>
                <p className="mt-3 text-center text-xs text-gray-500">
                  At checkout you can pay by card or choose{" "}
                  <span className="font-medium text-gray-700">On Account</span>.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <CartPageContent />
    </Suspense>
  );
}
