"use client";
 
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { useCoupon } from "@/components/CouponProvider";
import Image from "next/image";
import { validateAccessToken, getStoredToken } from "@/lib/access-token";
import { useCartStore } from "@/store/cartStore";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import ShippingOptions from "@/components/ShippingOptions";
import { useShippingAddress } from "@/hooks/useShippingAddress";
import { calculateSubtotal, calculateGST, calculateTaxableSubtotal, calculateTotal } from "@/lib/cart/pricing";
import { formatPrice, formatPriceWithLabel } from "@/lib/format-utils";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";
import { canIncrementQty, clampToStockCap, getStockCap } from "@/lib/woo/stockLimit";

function CartQtyStepper({
  id,
  qty,
  manageStock,
  stockQuantity,
  onUpdateQty,
}: {
  id: string;
  qty: number;
  manageStock?: boolean;
  stockQuantity?: number | null;
  onUpdateQty: (id: string, qty: number) => void;
}) {
  const stockCap = getStockCap({
    manage_stock: manageStock,
    stock_quantity: stockQuantity,
  });
  const handleQtyChange = (newQty: number) => {
    onUpdateQty(id, clampToStockCap(newQty, stockCap));
  };

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (qty > 1) handleQtyChange(qty - 1);
        }}
        disabled={qty <= 1}
        className="flex min-h-11 min-w-11 items-center justify-center text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:min-w-10"
        aria-label="Decrease quantity"
      >
        <span className="text-lg font-medium leading-none" aria-hidden>
          −
        </span>
      </button>
      <input
        id={`cart-qty-${id}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={stockCap ?? undefined}
        value={qty}
        onChange={(e) => handleQtyChange(Number(e.target.value))}
        className="min-h-11 w-12 border-x border-gray-300 bg-transparent px-1 py-2 text-center text-base tabular-nums text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500/30 sm:min-h-10 sm:w-11 sm:text-sm"
        aria-label="Quantity"
      />
      <button
        type="button"
        onClick={() => {
          if (canIncrementQty(qty, stockCap)) handleQtyChange(qty + 1);
        }}
        disabled={!canIncrementQty(qty, stockCap)}
        className="flex min-h-11 min-w-11 items-center justify-center text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:min-w-10"
        aria-label="Increase quantity"
      >
        <span className="text-lg font-medium leading-none" aria-hidden>
          +
        </span>
      </button>
    </div>
  );
}

function CartPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { items, updateItemQty, removeItem, isHydrated, isCartMerging, hasLoadedServerCart } =
    useCart();
  const {
    appliedCoupon,
    discount,
    applyCoupon: applyWooCoupon,
    removeCoupon: removeWooCoupon,
    isLoading: couponLoading,
    error: couponError,
  } = useCoupon();
  const [couponInput, setCouponInput] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [persistHydrated, setPersistHydrated] = useState(false);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const { country: shippingCountry, zone: shippingZone } = useShippingAddress();
 
  // Zustand persist rehydrates localStorage after first paint; until then `items` can be [].
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (useCartStore.persist.hasHydrated()) {
      setPersistHydrated(true);
    }
    return useCartStore.persist.onFinishHydration(() => {
      setPersistHydrated(true);
    });
  }, []);
 
  // Ensure component is mounted before accessing browser APIs
  useEffect(() => {
    setIsMounted(true);
  }, []);
 
  // Logged-in users: wait for optional dashboard cart load before treating empty `items` as final.
  const serverCartKnown = !user?.id || hasLoadedServerCart;
  const cartStateKnown =
    isHydrated && !isCartMerging && persistHydrated && serverCartKnown;
 
  // Validate access token and empty cart only after cart state is restored (avoids false /shop redirect)
  useEffect(() => {
    if (!isMounted || typeof window === "undefined" || !cartStateKnown) return;
 
    const token = searchParams.get("token") || getStoredToken();
 
    if (!validateAccessToken(token, "cart")) {
      router.push("/");
      return;
    }
 
    if (items.length === 0) {
      router.push("/shop");
      return;
    }
 
    setIsAuthorized(true);
 
    if (searchParams.has("token")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("token");
      const cleanUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(cleanUrl);
    }
  }, [isMounted, cartStateKnown, searchParams, router, items.length, pathname]);
 
  const subtotal = useMemo(() => calculateSubtotal(items), [items]);
  const taxableSubtotal = useMemo(() => calculateTaxableSubtotal(items), [items]);
 
  const gst = useMemo(() => {
    return calculateGST(subtotal, shippingCost, discount, 0, taxableSubtotal);
  }, [subtotal, taxableSubtotal, discount, shippingCost]);
 
  const total = useMemo(() => {
    return calculateTotal(subtotal, shippingCost, discount, gst);
  }, [subtotal, discount, shippingCost, gst]);
 
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const ok = await applyWooCoupon(code, items, subtotal);
    if (ok) setCouponInput("");
  };
 
  if (!isMounted || !cartStateKnown || !isAuthorized) {
    return (
      <div className="text-center">
        <div className="text-gray-600 mb-2">Loading cart…</div>
        <div className="text-sm text-gray-500">
          {!cartStateKnown ? "Restoring your cart" : "Redirecting…"}
        </div>
      </div>
    );
  }
 
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <h1 className="mb-4 pt-2 text-2xl font-semibold text-[#000] sm:mb-6 sm:pt-4 sm:text-3xl">
        Shopping Cart
      </h1>

      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        {/* Cart Items Section */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#000] sm:text-xl">Cart Items</h2>
            {items.length === 0 ? (
              <div className="py-8 text-center text-gray-600">Your cart is empty.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((i) => (
                  <li key={i.id} className="py-5 first:pt-0 sm:py-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                      <div className="relative mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:mx-0 sm:h-24 sm:w-24 sm:rounded-lg">
                        {i.imageUrl ? (
                          <Image
                            src={i.imageUrl}
                            alt={i.name}
                            fill
                            sizes="(max-width: 640px) 112px, 96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-gray-600">
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold leading-snug text-gray-900 sm:text-[17px]">
                          {i.name}
                        </h3>

                        {i.attributes && Object.keys(i.attributes).length > 0 && (
                          <div className="mt-2 text-sm leading-relaxed text-gray-600">
                            <span className="font-medium text-gray-700">Variations: </span>
                            {Object.entries(i.attributes).map(([key, value], idx) => (
                              <span key={key}>
                                {key}: <span className="font-medium text-gray-900">{value}</span>
                                {idx < Object.entries(i.attributes || {}).length - 1 && ", "}
                              </span>
                            ))}
                          </div>
                        )}

                        {i.sku && (
                          <div className="mt-1.5 text-sm text-gray-600">
                            <span className="font-medium text-gray-700">SKU: </span>
                            <span className="text-gray-900">{i.sku}</span>
                          </div>
                        )}

                        {i.deliveryPlan && i.deliveryPlan !== "none" && (
                          <div className="mt-1.5 text-sm text-gray-600">
                            <span className="font-medium text-gray-700">Delivery: </span>
                            <span className="text-gray-900">
                              {getDeliveryFrequencyLabel(i.deliveryPlan)}
                            </span>
                          </div>
                        )}
                        {i.empowerEligible && (
                          <div className="mt-2 text-xs font-medium text-emerald-700">
                            Empower discount available at checkout
                          </div>
                        )}

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
                          const showEachRow =
                            i.qty > 1 ||
                            (priceInfo.label &&
                              totalInfo.label &&
                              `${priceInfo.label}: ${priceInfo.price}` !==
                                `${totalInfo.label}: ${totalInfo.price}`);
                          return (
                            <div className="mt-4 flex flex-col gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
                              <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <span className="text-sm font-medium text-gray-700">Qty</span>
                                <CartQtyStepper
                                  id={i.id}
                                  qty={i.qty}
                                  manageStock={i.manageStock}
                                  stockQuantity={i.stockQuantity}
                                  onUpdateQty={updateItemQty}
                                />
                              </div>
                              <div className="text-left sm:text-right">
                                <div className="text-lg font-bold tabular-nums text-gray-900 sm:text-base">
                                  {totalInfo.label
                                    ? `${totalInfo.label}: ${totalInfo.price}`
                                    : totalInfo.price}
                                </div>
                                {showEachRow && (
                                  <div className="mt-0.5 text-sm text-gray-600 tabular-nums">
                                    {priceInfo.label
                                      ? `${priceInfo.label}: ${priceInfo.price}`
                                      : priceInfo.price}{" "}
                                    each
                                  </div>
                                )}
                                {totalInfo.exclPrice && (
                                  <div className="mt-1 text-xs text-gray-600">
                                    Excl. GST: {totalInfo.exclPrice} total
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => removeItem(i.id)}
                          className="mt-4 flex w-full min-h-11 items-center justify-center rounded-lg border border-rose-200 bg-rose-50/80 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 sm:mt-3 sm:inline-flex sm:w-auto sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-rose-600 sm:hover:bg-transparent sm:hover:text-rose-800 sm:hover:underline"
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

          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-2 text-sm font-medium text-gray-700">Have any discount code?</h2>
            {!appliedCoupon ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Enter coupon code"
                  disabled={couponLoading}
                  className="min-h-11 w-full flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base disabled:bg-gray-100 sm:min-h-10 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => void applyCoupon()}
                  disabled={couponLoading || !couponInput.trim()}
                  className="min-h-11 shrink-0 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:bg-gray-400 sm:min-h-10"
                >
                  {couponLoading ? "…" : "Apply"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="font-medium text-emerald-900">{appliedCoupon.code}</span>
                <button
                  type="button"
                  onClick={() => {
                    removeWooCoupon();
                    setCouponInput("");
                  }}
                  className="text-emerald-800 underline hover:text-emerald-950"
                >
                  Remove
                </button>
              </div>
            )}
            {couponError && <div className="mt-2 text-xs text-red-600">{couponError}</div>}
            {discount > 0 && (
              <div className="mt-2 text-xs text-green-600">
                Estimated ${discount.toFixed(2)} off (confirmed at checkout).
              </div>
            )}
            {items.some((i) => i.empowerEligible) && (
              <div className="mt-2 text-xs font-medium text-emerald-700">
                Empower discount available at checkout
              </div>
            )}
          </div>
        </div>
 
        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Order Summary</h2>
 
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