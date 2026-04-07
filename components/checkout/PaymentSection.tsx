"use client";

import Link from "next/link";
import { memo } from "react";
import { Controller, useWatch, type Control, type FieldErrors } from "react-hook-form";
import type { CartItem } from "@/lib/types/cart";
import ShippingOptions from "@/components/ShippingOptions";
import ParcelProtection from "@/components/ParcelProtection";
import type { CheckoutFormData, ShippingMethodType } from "@/lib/checkout/schema";
import { normalizeCountryCode } from "@/lib/checkout/normalizeCountry";
import { FOCUS_RING, FOCUS_RING_BTN, FOCUS_RING_LINK } from "@/lib/checkout/uiConstants";
import RequiredMark from "./RequiredMark";
import { getPaymentMethodOptionLabel } from "@/lib/checkout/paymentDisplay";

export type PaymentSectionProps = {
  items: CartItem[];
  cartSubtotal: number;
  control: Control<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  selectedPaymentMethod: "eway" | "cod";
  onPaymentMethodChange: (method: "eway" | "cod") => void;
  placing: boolean;
  ewayTokenFlowEnabled: boolean;
  canUseOnAccount: boolean;
};

function useShipToForRates(control: Control<CheckoutFormData>) {
  const shipToDifferent = useWatch({ control, name: "shipToDifferentAddress", defaultValue: false });
  const billing_country = useWatch({ control, name: "billing_country", defaultValue: "AU" });
  const billing_postcode = useWatch({ control, name: "billing_postcode", defaultValue: "" });
  const billing_state = useWatch({ control, name: "billing_state", defaultValue: "" });
  const billing_city = useWatch({ control, name: "billing_city", defaultValue: "" });
  const shipping_country = useWatch({ control, name: "shipping_country", defaultValue: "AU" });
  const shipping_postcode = useWatch({ control, name: "shipping_postcode", defaultValue: "" });
  const shipping_state = useWatch({ control, name: "shipping_state", defaultValue: "" });
  const shipping_city = useWatch({ control, name: "shipping_city", defaultValue: "" });

  const billingCountry = normalizeCountryCode(billing_country || "");
  const shippingCountryNorm = normalizeCountryCode(shipping_country || "");
  const shipCountry = shipToDifferent ? shippingCountryNorm : billingCountry;
  const shipPostcode = shipToDifferent ? String(shipping_postcode ?? "") : String(billing_postcode ?? "");
  const shipState = shipToDifferent ? String(shipping_state ?? "") : String(billing_state ?? "");
  const shipCity = shipToDifferent ? String(shipping_city ?? "") : String(billing_city ?? "");

  return { shipCountry, shipPostcode, shipState, shipCity };
}

function ShippingMethodBlock({
  control,
  errors,
  cartSubtotal,
  items,
}: {
  control: Control<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  cartSubtotal: number;
  items: CartItem[];
}) {
  const { shipCountry, shipPostcode, shipState, shipCity } = useShipToForRates(control);

  return (
    <>
      <div className="mt-6 border-t border-gray-200 pt-4">
        <h3
          id="checkout-sidebar-shipping-method"
          className="mb-4 text-base font-semibold text-gray-900"
        >
          Shipping method
        </h3>
        <fieldset
          className="min-w-0 border-0 p-0"
          aria-labelledby="checkout-sidebar-shipping-method"
          aria-describedby={errors.shippingMethod ? "checkout-shipping-method-err" : undefined}
        >
          <legend className="sr-only">Choose a shipping method for your order</legend>
          <Controller
            name="shippingMethod"
            control={control}
            render={({ field }) => (
              <ShippingOptions
                key={`shipping-${shipCountry}-${shipPostcode}-${shipState}-${shipCity}`}
                country={shipCountry}
                postcode={shipPostcode}
                state={shipState}
                city={shipCity}
                subtotal={cartSubtotal}
                items={items}
                selectedRateId={(field.value as ShippingMethodType | undefined)?.id}
                onRateChange={(rateId, rate) => {
                  field.onChange({
                    id: rateId,
                    method_id: rate.id,
                    label: rate.label,
                    cost: rate.cost,
                    total: rate.cost,
                    description: rate.description,
                  });
                }}
                showLabel={false}
                className=""
              />
            )}
          />
        </fieldset>
        {errors.shippingMethod && (
          <p id="checkout-shipping-method-err" className="mt-2 text-xs text-rose-700">
            {errors.shippingMethod.message}
          </p>
        )}
      </div>
    </>
  );
}

function PaymentSectionInner({
  items,
  cartSubtotal,
  control,
  errors,
  selectedPaymentMethod,
  onPaymentMethodChange,
  placing,
  ewayTokenFlowEnabled,
  canUseOnAccount,
}: PaymentSectionProps) {
  return (
    <>
      <ShippingMethodBlock
        control={control}
        errors={errors}
        cartSubtotal={cartSubtotal}
        items={items}
      />

      <div className="mt-6 border-t pt-4">
        <Controller
          name="insurance_option"
          control={control}
          render={({ field }) => (
            <ParcelProtection
              insurance_option={
                field.value === "yes" || field.value === "no" ? field.value : "no"
              }
              onInsuranceChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="mt-6 border-t border-gray-200 pt-4">
        <h3 id="checkout-payment-heading" className="mb-4 text-base font-semibold text-gray-900">
          Payment method
        </h3>
        <fieldset className="min-w-0 border-0 p-0" aria-labelledby="checkout-payment-heading">
          <legend className="sr-only">Choose how you will pay</legend>
          <div className="space-y-2">
            <label
              htmlFor="checkout-payment-eway"
              className={`flex cursor-pointer items-start gap-3 rounded border border-gray-300 p-3 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
            >
              <input
                id="checkout-payment-eway"
                type="radio"
                name="checkout_payment_method"
                value="eway"
                checked={selectedPaymentMethod === "eway"}
                onChange={() => onPaymentMethodChange("eway")}
                className={`mt-1 h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {getPaymentMethodOptionLabel({ id: "eway", title: "Credit card (eWAY)" })}
                </div>
                <p className="mt-1 text-xs text-gray-700">Secure hosted payment via eWAY.</p>
              </div>
            </label>
            {canUseOnAccount && (
              <label
                htmlFor="checkout-payment-cod"
                className={`flex cursor-pointer items-start gap-3 rounded border border-gray-300 p-3 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
              >
                <input
                  id="checkout-payment-cod"
                  type="radio"
                  name="checkout_payment_method"
                  value="cod"
                  checked={selectedPaymentMethod === "cod"}
                  onChange={() => onPaymentMethodChange("cod")}
                  className={`mt-1 h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {getPaymentMethodOptionLabel({ id: "cod", title: "" })}
                  </div>
                  <p className="mt-1 text-xs text-gray-700">Pay later via your account.</p>
                </div>
              </label>
            )}
          </div>
        </fieldset>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-4">
        <label className="flex cursor-pointer items-start gap-2 text-gray-900" htmlFor="checkout-terms">
          <Controller
            name="termsAccepted"
            control={control}
            render={({ field: { value, onChange, ...field } }) => (
              <input
                {...field}
                id="checkout-terms"
                type="checkbox"
                checked={value || false}
                onChange={(e) => onChange(e.target.checked)}
                aria-invalid={errors.termsAccepted ? "true" : "false"}
                aria-describedby={errors.termsAccepted ? "checkout-terms-err" : undefined}
                aria-required="true"
                className={`mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
              />
            )}
          />
          <span className="text-sm">
            I agree to the{" "}
            <Link
              href="/terms"
              className={`font-medium text-blue-800 underline decoration-blue-800 underline-offset-2 hover:text-blue-950 ${FOCUS_RING_LINK}`}
            >
              Terms and Conditions
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className={`font-medium text-blue-800 underline decoration-blue-800 underline-offset-2 hover:text-blue-950 ${FOCUS_RING_LINK}`}
            >
              Privacy Policy
            </Link>
            <RequiredMark />
          </span>
        </label>
        {errors.termsAccepted && (
          <p id="checkout-terms-err" className="mt-1 text-xs text-rose-700">
            {errors.termsAccepted.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={placing}
        aria-busy={placing}
        className={`mt-6 w-full rounded-md bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING_BTN} focus:ring-offset-white`}
      >
        {placing
          ? selectedPaymentMethod === "eway"
            ? "Redirecting to secure payment…"
            : "Placing your order…"
          : selectedPaymentMethod === "cod"
            ? "Place order on account"
            : ewayTokenFlowEnabled
              ? "Verify & pay"
              : "Pay securely with card"}
      </button>
    </>
  );
}

export default memo(PaymentSectionInner);
