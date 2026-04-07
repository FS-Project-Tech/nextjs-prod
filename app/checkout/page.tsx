"use client";

import { Suspense } from "react";
import Link from "next/link";
import { getCartUrl } from "@/lib/access-token";
import { useCheckoutPageState } from "@/lib/checkout/useCheckoutPageState";
import { FOCUS_RING_BTN } from "@/lib/checkout/uiConstants";
import CheckoutForm from "@/components/checkout/CheckoutForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import PaymentSection from "@/components/checkout/PaymentSection";

function Spinner({ label }: { label: string }) {
  return (
    <div className="container flex min-h-screen items-center justify-center bg-gray-50 py-10">
      <div className="text-center" role="status" aria-live="polite">
        <div
          className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"
          aria-hidden="true"
        />
        <p className="mt-4 text-gray-900">{label}</p>
      </div>
    </div>
  );
}

function CheckoutPageInner() {
  const checkout = useCheckoutPageState();

  if (!checkout.isMounted) {
    return <Spinner label="Loading checkout…" />;
  }

  const {
    cartLines,
    postSubmitNavigation,
    subtotal,
    cartSubtotal,
    couponDiscount,
    appliedCoupon,
    shippingCost,
    parcelProtectionFee,
    gst,
    orderTotal,
    placing,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    user,
    billingAddresses,
    shippingAddresses,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    selectedShippingAddressId,
    setSelectedShippingAddressId,
    openNdisSection,
    setOpenNdisSection,
    openHcpSection,
    setOpenHcpSection,
    control,
    register,
    errors,
    setValue,
    ewayTokenFlowEnabled,
    canUseOnAccount,
    onFormSubmit,
  } = checkout;

  if (cartLines.length === 0) {
    if (postSubmitNavigation === "secure_payment") {
      return <Spinner label="Redirecting to secure payment…" />;
    }
    if (postSubmitNavigation === "order_confirmation") {
      return <Spinner label="Redirecting to order confirmation…" />;
    }
    return (
      <div className="container min-h-screen py-10">
        <div className="py-20 text-center">
          <h1 className="mb-4 text-2xl font-semibold text-gray-900">Your cart is empty</h1>
          <Link
            href="/shop"
            className={`inline-block rounded-md bg-gray-900 px-6 py-3 text-white hover:bg-black ${FOCUS_RING_BTN}`}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <a
        href="#checkout-main"
        className={`fixed left-4 top-4 z-[200] -translate-y-[200%] rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white opacity-0 transition focus:translate-y-0 focus:opacity-100 ${FOCUS_RING_BTN} focus:ring-white focus:ring-offset-gray-900`}
      >
        Skip to checkout form
      </a>
      <div className="container min-h-screen py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Checkout</h1>
          <Link
            href={getCartUrl()}
            className={`rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
          >
            View Cart
          </Link>
        </div>

        <div className="relative">
          {placing && (
            <div
              className="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-white/55 backdrop-blur-sm"
              aria-hidden={false}
              aria-busy="true"
              aria-live="polite"
            >
              <div className="rounded-lg bg-white/90 px-6 py-4 text-center shadow-lg ring-1 ring-gray-200">
                <div
                  className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-solid border-gray-900 border-r-transparent"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-gray-900">Processing checkout…</p>
                <p className="mt-1 text-xs text-gray-600">Please do not refresh or close this page.</p>
              </div>
            </div>
          )}
          <form
            id="checkout-main"
            onSubmit={onFormSubmit}
            className={`grid gap-6 lg:grid-cols-3 ${placing ? "pointer-events-none select-none" : ""}`}
            noValidate
            aria-label="Checkout and place order"
          >
          <CheckoutForm
            user={user}
            billingAddresses={billingAddresses}
            shippingAddresses={shippingAddresses}
            selectedBillingAddressId={selectedBillingAddressId}
            setSelectedBillingAddressId={setSelectedBillingAddressId}
            selectedShippingAddressId={selectedShippingAddressId}
            setSelectedShippingAddressId={setSelectedShippingAddressId}
            openNdisSection={openNdisSection}
            setOpenNdisSection={setOpenNdisSection}
            openHcpSection={openHcpSection}
            setOpenHcpSection={setOpenHcpSection}
            control={control}
            register={register}
            errors={errors}
            setValue={setValue}
          />

          <aside className="lg:col-span-1" aria-labelledby="checkout-order-summary-heading">
            <div className="sticky top-[12.5rem] rounded-xl bg-white p-6">
              <OrderSummary
                items={cartLines}
                subtotal={subtotal}
                couponDiscount={couponDiscount}
                appliedCoupon={appliedCoupon}
                shippingCost={shippingCost}
                parcelProtectionFee={parcelProtectionFee}
                gst={gst}
                orderTotal={orderTotal}
              />
              <PaymentSection
                items={cartLines}
                cartSubtotal={cartSubtotal}
                control={control}
                errors={errors}
                selectedPaymentMethod={selectedPaymentMethod}
                onPaymentMethodChange={setSelectedPaymentMethod}
                placing={placing}
                ewayTokenFlowEnabled={ewayTokenFlowEnabled}
                canUseOnAccount={canUseOnAccount}
              />
            </div>
          </aside>
        </form>
        </div>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Spinner label="Loading checkout…" />}>
      <CheckoutPageInner />
    </Suspense>
  );
}
