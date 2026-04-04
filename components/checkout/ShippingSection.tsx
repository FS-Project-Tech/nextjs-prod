"use client";

import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";
import { nameCharsOnly } from "@/lib/form-validation";
import { applySavedShippingAddress, clearShippingAddressFields } from "@/lib/checkout/savedAddressPatch";

export type ShippingSectionProps = {
  user: { id?: string } | null;
  shippingAddresses: Address[];
  selectedShippingAddressId: string;
  setSelectedShippingAddressId: (id: string) => void;
  control: Control<CheckoutFormData>;
  setValue: UseFormSetValue<CheckoutFormData>;
};

export default function ShippingSection({
  user,
  shippingAddresses,
  selectedShippingAddressId,
  setSelectedShippingAddressId,
  control,
  setValue,
}: ShippingSectionProps) {
  const watchedShipToDifferent = useWatch({
    control,
    name: "shipToDifferentAddress",
    defaultValue: false,
  });

  return (
    <section className="rounded-xl bg-white p-6" aria-labelledby="checkout-shipping-heading">
      <h2 id="checkout-shipping-heading" className="mb-4 text-lg font-semibold text-gray-900">
        Shipping
      </h2>
      <label className="flex cursor-pointer items-center gap-2 text-gray-900">
        <Controller
          name="shipToDifferentAddress"
          control={control}
          render={({ field: { value, onChange, ...field } }) => (
            <input
              type="checkbox"
              {...field}
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              className={`h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
            />
          )}
        />
        <span className="text-sm font-medium">Ship to a different address</span>
      </label>

      {watchedShipToDifferent ? (
        <div className="mt-4 space-y-4">
          {user && shippingAddresses.length > 0 && (
            <div>
              <label
                htmlFor="checkout-select-shipping-saved"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                Select saved shipping address
              </label>
              <select
                id="checkout-select-shipping-saved"
                value={selectedShippingAddressId}
                onChange={(e) => {
                  const addressId = e.target.value;
                  setSelectedShippingAddressId(addressId);
                  if (!addressId) {
                    clearShippingAddressFields(setValue);
                    return;
                  }
                  const saved = shippingAddresses.find((a) => String(a.id) === String(addressId));
                  if (saved) applySavedShippingAddress(setValue, saved);
                }}
                className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
              >
                <option value="">Enter address manually</option>
                {shippingAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label || "Address"} - {address.address_1}, {address.city}
                  </option>
                ))}
              </select>
              {selectedShippingAddressId ? (
                <p className="mt-2 rounded border border-amber-800 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  To edit this address, select &quot;Enter address manually&quot; above.
                </p>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
              <Controller
                name="shipping_first_name"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
              <Controller
                name="shipping_last_name"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Company (Optional)
              </label>
              <Controller
                name="shipping_company"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
              <Controller
                name="shipping_address_1"
                control={control}
                render={({ field }) => (
                  <AddressAutocomplete
                    value={field.value}
                    onChange={field.onChange}
                    onPlaceSelect={(addr) => {
                      if (addr.address_2) setValue("shipping_address_2", addr.address_2);
                      setValue("shipping_city", addr.city);
                      setValue("shipping_state", addr.state);
                      setValue("shipping_postcode", addr.postcode);
                      setValue("shipping_country", addr.country || "AU");
                    }}
                    disabled={!!selectedShippingAddressId}
                    placeholder="Start typing your address..."
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
              <Controller
                name="shipping_city"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Postcode</label>
              <Controller
                name="shipping_postcode"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
              <Controller
                name="shipping_state"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    disabled={!!selectedShippingAddressId}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
              <Controller
                name="shipping_country"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    disabled={!!selectedShippingAddressId}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                  >
                    <option value="AU">Australia</option>
                    <option value="NZ">New Zealand</option>
                  </select>
                )}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
