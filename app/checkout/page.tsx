"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getCartUrl } from "@/lib/access-token";
import { useCheckoutPageState } from "@/lib/checkout/useCheckoutPageState";
import { FOCUS_RING_BTN } from "@/lib/checkout/uiConstants";
import CheckoutForm from "@/components/checkout/CheckoutForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import PaymentSection from "@/components/checkout/PaymentSection";
import CheckoutPlacingOverlay from "@/components/checkout/CheckoutPlacingOverlay";

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

function RotatingCheckoutCube() {
  return (
    <div className="mx-auto h-8 w-8 [perspective:360px]" aria-hidden="true">
      <div className="relative h-8 w-8 animate-[checkout-cube-spin_1.8s_ease-in-out_infinite] [transform-style:preserve-3d]">
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:translateZ(1rem)]" />
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:rotateY(180deg)_translateZ(1rem)]" />
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:rotateY(90deg)_translateZ(1rem)]" />
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:rotateY(-90deg)_translateZ(1rem)]" />
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:rotateX(90deg)_translateZ(1rem)]" />
        <span className="absolute inset-0 rounded-md border border-white/50 bg-teal-600 shadow-md shadow-teal-900/20 [transform:rotateX(-90deg)_translateZ(1rem)]" />
      </div>
    </div>
  );
}

function SavedAddressesOverlay() {
  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-white/70 p-4 backdrop-blur-[2px]"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white/95 p-6 text-center shadow-2xl">
        <RotatingCheckoutCube />
        <p className="mt-5 text-base font-semibold text-gray-950">Preparing your saved checkout</p>
      </div>
    </div>
  );
}

const CHECKOUT_CUBE_KEYFRAMES = `
  @keyframes checkout-cube-spin {
    0% {
      transform: rotateX(-24deg) rotateY(0deg) rotateZ(0deg);
    }
    45% {
      transform: rotateX(28deg) rotateY(180deg) rotateZ(8deg);
    }
    100% {
      transform: rotateX(-24deg) rotateY(360deg) rotateZ(0deg);
    }
  }
`;

const PLACING_OVERLAY_Z = "z-[110]";

function CheckoutPageInner() {
  const checkout = useCheckoutPageState();
  const [placingPortalMounted, setPlacingPortalMounted] = useState(false);

  const { isMounted, cartReady, placing, savedAddressesReady } = checkout;
  const savedAddressesBlocking = isMounted && cartReady && !savedAddressesReady;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPlacingPortalMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!placing && !savedAddressesBlocking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [placing, savedAddressesBlocking]);

  if (!isMounted || !cartReady) {
    return <Spinner label="Loading checkout…" />;
  }

  const {
    cartLines: lines,
    postSubmitNavigation,
    subtotal,
    cartSubtotal,
    couponDiscount,
    empowerDiscount,
    empowerDiscountEligible,
    empowerDiscountApplied,
    onApplyEmpowerDiscount,
    appliedCoupon,
    shippingCost,
    gst,
    orderTotal,
    totalsQuoteLoading,
    selectedPaymentMethod,
    onUserPaymentMethodChange,
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
    recoveryBannerVisible,
    recoveryChecking,
    placingSubmitPhase,
  } = checkout;

  if (lines.length === 0) {
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

  const placingOverlay =
    placing && placingPortalMounted ? (
      <div
        className={`fixed inset-0 ${PLACING_OVERLAY_Z} flex items-center justify-center bg-white/55 p-4 backdrop-blur-sm`}
        aria-hidden={false}
        aria-busy="true"
        aria-live="polite"
      >
        <CheckoutPlacingOverlay paymentMethod={selectedPaymentMethod} />
      </div>
    ) : null;

  const savedAddressesOverlay =
    savedAddressesBlocking && placingPortalMounted ? <SavedAddressesOverlay /> : null;

  return (
    <>
      <style>{CHECKOUT_CUBE_KEYFRAMES}</style>
      {savedAddressesOverlay ? createPortal(savedAddressesOverlay, document.body) : null}
      {placingOverlay ? createPortal(placingOverlay, document.body) : null}
      <a
        href="#checkout-main"
        className={`fixed left-4 top-4 z-[200] -translate-y-[200%] rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white opacity-0 transition focus:translate-y-0 focus:opacity-100 ${FOCUS_RING_BTN} focus:ring-white focus:ring-offset-gray-900`}
      >
        Skip to checkout form
      </a>
      <div className="container min-h-screen py-10">
        {recoveryBannerVisible ? (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">We&apos;re checking your order status…</p>
            {recoveryChecking ? (
              <p className="mt-1 text-amber-900/80">This only takes a moment.</p>
            ) : null}
          </div>
        ) : null}

        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Checkout</h1>
          <Link
            href={getCartUrl()}
            className={`rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
          >
            View Cart
          </Link>
        </div>

        <form
            id="checkout-main"
            onSubmit={onFormSubmit}
            className={`grid gap-6 lg:grid-cols-3 ${placing || savedAddressesBlocking ? "pointer-events-none select-none" : ""}`}
            noValidate
            aria-label="Checkout and place order"
            aria-busy={savedAddressesBlocking || placing}
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
                items={lines}
                subtotal={subtotal}
                couponDiscount={couponDiscount}
                empowerDiscount={empowerDiscount}
                empowerDiscountEligible={empowerDiscountEligible}
                empowerDiscountApplied={empowerDiscountApplied}
                onApplyEmpowerDiscount={onApplyEmpowerDiscount}
                appliedCoupon={appliedCoupon}
                shippingCost={shippingCost}
                gst={gst}
                orderTotal={orderTotal}
                totalsSyncing={totalsQuoteLoading}
              />

              <PaymentSection
                items={lines}
                cartSubtotal={cartSubtotal}
                control={control}
                errors={errors}
                selectedPaymentMethod={selectedPaymentMethod}
                onPaymentMethodChange={onUserPaymentMethodChange}
                placing={placing}
                placingSubmitPhase={placingSubmitPhase}
                ewayTokenFlowEnabled={ewayTokenFlowEnabled}
                canUseOnAccount={canUseOnAccount}
              />
            </div>
          </aside>
        </form>
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
