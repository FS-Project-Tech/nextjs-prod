"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RequiredMark from "@/components/checkout/RequiredMark";
import { nameCharsOnly, digitsOnly } from "@/lib/form-validation";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";
import { applySavedBillingAddress, clearBillingAddressFields } from "@/lib/checkout/savedAddressPatch";
import { useBillingMirror } from "@/lib/checkout/useBillingMirror";

export type BillingSectionProps = {
  user: { id?: string } | null;
  billingAddresses: Address[];
  selectedBillingAddressId: string;
  setSelectedBillingAddressId: (id: string) => void;
  control: Control<CheckoutFormData>;
  register: UseFormRegister<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  setValue: UseFormSetValue<CheckoutFormData>;
};

export default function BillingSection({
  user,
  billingAddresses,
  selectedBillingAddressId,
  setSelectedBillingAddressId,
  control,
  register,
  errors,
  setValue,
}: BillingSectionProps) {
  useBillingMirror(control, setValue);

  return (
    <section className="rounded-xl bg-white p-6" aria-labelledby="checkout-billing-heading">
      <h2 id="checkout-billing-heading" className="mb-4 text-lg font-semibold text-gray-900">
        Billing details
      </h2>
      {user && billingAddresses.length > 0 && (
        <div className="mb-4">
          <label
            htmlFor="checkout-select-billing-saved"
            className="mb-2 block text-sm font-medium text-gray-900"
          >
            Select saved billing address
          </label>
          <select
            id="checkout-select-billing-saved"
            value={selectedBillingAddressId}
            onChange={(e) => {
              const addressId = e.target.value;
              setSelectedBillingAddressId(addressId);
              if (!addressId) {
                clearBillingAddressFields(setValue);
                return;
              }
              const saved = billingAddresses.find((a) => String(a.id) === String(addressId));
              if (saved) applySavedBillingAddress(setValue, saved);
            }}
            className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
          >
            <option value="">Enter address manually</option>
            {billingAddresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label || "Address"} - {address.address_1}, {address.city}
              </option>
            ))}
          </select>
          {selectedBillingAddressId ? (
            <p
              className="mt-2 rounded border border-amber-800 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              role="note"
            >
              To edit this address, select &quot;Enter address manually&quot; above.
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="checkout-billing-first-name"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            First name <RequiredMark />
          </label>
          <Controller
            name="billing_first_name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-first-name"
                type="text"
                autoComplete="given-name"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_first_name ? "true" : "false"}
                aria-required="true"
                aria-describedby={
                  errors.billing_first_name ? "checkout-billing-first-name-err" : undefined
                }
                onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_first_name ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_first_name && (
            <p id="checkout-billing-first-name-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_first_name.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="checkout-billing-last-name"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Last name <RequiredMark />
          </label>
          <Controller
            name="billing_last_name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-last-name"
                type="text"
                autoComplete="family-name"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_last_name ? "true" : "false"}
                aria-required="true"
                aria-describedby={
                  errors.billing_last_name ? "checkout-billing-last-name-err" : undefined
                }
                onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_last_name ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_last_name && (
            <p id="checkout-billing-last-name-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_last_name.message}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="checkout-billing-email"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Email <RequiredMark />
          </label>
          <Controller
            name="billing_email"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-email"
                type="email"
                autoComplete="email"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_email ? "true" : "false"}
                aria-required="true"
                aria-describedby={errors.billing_email ? "checkout-billing-email-err" : undefined}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_email ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_email && (
            <p id="checkout-billing-email-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_email.message}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="checkout-billing-phone"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Phone <RequiredMark />
          </label>
          <Controller
            name="billing_phone"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                disabled={!!selectedBillingAddressId}
                maxLength={10}
                aria-invalid={errors.billing_phone ? "true" : "false"}
                aria-required="true"
                aria-describedby={errors.billing_phone ? "checkout-billing-phone-err" : undefined}
                onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_phone ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_phone && (
            <p id="checkout-billing-phone-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_phone.message}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="checkout-billing-company"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Company <span className="font-normal text-gray-600">(optional)</span>
          </label>
          <Controller
            name="billing_company"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-company"
                type="text"
                autoComplete="organization"
                disabled={!!selectedBillingAddressId}
                className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="checkout-billing-address-1"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Address <RequiredMark />
          </label>
          <Controller
            name="billing_address_1"
            control={control}
            render={({ field }) => (
              <AddressAutocomplete
                id="checkout-billing-address-1"
                value={field.value}
                onChange={field.onChange}
                onPlaceSelect={(addr) => {
                  if (addr.address_2) setValue("billing_address_2", addr.address_2);
                  setValue("billing_city", addr.city);
                  setValue("billing_state", addr.state);
                  setValue("billing_postcode", addr.postcode);
                  setValue("billing_country", addr.country || "AU");
                }}
                disabled={!!selectedBillingAddressId}
                error={!!errors.billing_address_1}
                placeholder="Start typing your address..."
                aria-label="Street address"
                aria-invalid={errors.billing_address_1 ? "true" : "false"}
                aria-required="true"
                aria-describedby={
                  errors.billing_address_1 ? "checkout-billing-address-1-err" : undefined
                }
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_address_1 ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_address_1 && (
            <p id="checkout-billing-address-1-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_address_1.message}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="checkout-billing-address-2"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Address line 2 <span className="font-normal text-gray-600">(optional)</span>
          </label>
          <Controller
            name="billing_address_2"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-address-2"
                type="text"
                autoComplete="address-line2"
                disabled={!!selectedBillingAddressId}
                className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
        </div>
        <div>
          <label
            htmlFor="checkout-billing-city"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            City <RequiredMark />
          </label>
          <Controller
            name="billing_city"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-city"
                type="text"
                autoComplete="address-level2"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_city ? "true" : "false"}
                aria-required="true"
                aria-describedby={errors.billing_city ? "checkout-billing-city-err" : undefined}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_city ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_city && (
            <p id="checkout-billing-city-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_city.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="checkout-billing-postcode"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Postcode <RequiredMark />
          </label>
          <Controller
            name="billing_postcode"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-postcode"
                type="text"
                autoComplete="postal-code"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_postcode ? "true" : "false"}
                aria-required="true"
                aria-describedby={
                  errors.billing_postcode ? "checkout-billing-postcode-err" : undefined
                }
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_postcode ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_postcode && (
            <p id="checkout-billing-postcode-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_postcode.message}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="checkout-billing-state"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            State <RequiredMark />
          </label>
          <Controller
            name="billing_state"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                id="checkout-billing-state"
                type="text"
                autoComplete="address-level1"
                disabled={!!selectedBillingAddressId}
                aria-invalid={errors.billing_state ? "true" : "false"}
                aria-required="true"
                aria-describedby={errors.billing_state ? "checkout-billing-state-err" : undefined}
                className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_state ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
              />
            )}
          />
          {errors.billing_state && (
            <p id="checkout-billing-state-err" className="mt-1 text-xs text-rose-700">
              {errors.billing_state.message}
            </p>
          )}
        </div>
        <div>
          <span
            className="mb-1 block text-sm font-medium text-gray-900"
            id="checkout-billing-country-label"
          >
            Country <RequiredMark />
          </span>
          <>
            <input type="hidden" value="AU" {...register("billing_country", { required: true })} />
            <input
              type="text"
              readOnly
              value="Australia"
              tabIndex={0}
              id="checkout-billing-country-display"
              aria-labelledby="checkout-billing-country-label"
              aria-readonly="true"
              className={`w-full cursor-default rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
            />
          </>
          {errors.billing_country && (
            <p id="checkout-billing-country-err" className="mt-1 text-xs text-rose-700">
              Country is required
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
