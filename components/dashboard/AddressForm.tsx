"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import {
  isValidName,
  isValidEmail,
  isValidAuPhone,
  nameCharsOnly,
  digitsOnly,
} from "@/lib/form-validation";

export type AddressFormValues = {
  type: "billing" | "shipping";
  label: string;
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
  ndis_participant_name: string;
  ndis_number: string;
  ndis_dob: string;
  ndis_funding_type: string;
  ndis_approval: boolean;
  ndis_invoice_email: string;
  hcp_participant_name: string;
  hcp_number: string;
  hcp_provider_email: string;
  hcp_approval: boolean;
};

const ROW2: { key: keyof AddressFormValues; label: string; required?: boolean }[] = [
  { key: "first_name", label: "First name", required: true },
  { key: "last_name", label: "Last name", required: true },
];
const ROW3 = [{ key: "company" as const, label: "Company (optional)" }];
const ROW4 = [{ key: "address_1" as const, label: "Address line 1", required: true }];
const ROW5 = [{ key: "address_2" as const, label: "Address line 2 (optional)" }];
const ROW6: { key: keyof AddressFormValues; label: string; required?: boolean }[] = [
  { key: "city", label: "City", required: true },
  { key: "state", label: "State", required: true },
  { key: "postcode", label: "Postcode", required: true },
];
const ROW7 = [{ key: "country" as const, label: "Country", required: true, placeholder: "AU" }];
const ROW8: { key: keyof AddressFormValues; label: string; type?: string }[] = [
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
];

function defaultValues(type: "billing" | "shipping"): AddressFormValues {
  return {
    type,
    label: "",
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    postcode: "",
    country: "AU",
    email: "",
    phone: "",
    ndis_participant_name: "",
    ndis_number: "",
    ndis_dob: "",
    ndis_funding_type: "",
    ndis_approval: false,
    ndis_invoice_email: "",
    hcp_participant_name: "",
    hcp_number: "",
    hcp_provider_email: "",
    hcp_approval: false,
  };
}

function toPayload(values: AddressFormValues, includeNdisHcp: boolean): Omit<Address, "id"> {
  const trim = (s: string) => (s ?? "").trim();
  const payload: Omit<Address, "id"> = {
    type: values.type,
    label: trim(values.label) || undefined,
    first_name: trim(values.first_name),
    last_name: trim(values.last_name),
    company: trim(values.company) || "",
    address_1: trim(values.address_1),
    address_2: trim(values.address_2) || undefined,
    city: trim(values.city),
    state: trim(values.state),
    postcode: trim(values.postcode),
    country: trim(values.country) || "AU",
    email: trim(values.email) || undefined,
    phone: trim(values.phone) || undefined,
  };
  if (includeNdisHcp) {
    if (trim(values.ndis_participant_name))
      payload.ndis_participant_name = trim(values.ndis_participant_name);
    if (trim(values.ndis_number)) payload.ndis_number = trim(values.ndis_number);
    if (trim(values.ndis_dob)) payload.ndis_dob = trim(values.ndis_dob);
    if (trim(values.ndis_funding_type)) payload.ndis_funding_type = trim(values.ndis_funding_type);
    payload.ndis_approval = Boolean(values.ndis_approval);
    if (trim(values.ndis_invoice_email))
      payload.ndis_invoice_email = trim(values.ndis_invoice_email);
    if (trim(values.hcp_participant_name))
      payload.hcp_participant_name = trim(values.hcp_participant_name);
    if (trim(values.hcp_number)) payload.hcp_number = trim(values.hcp_number);
    if (trim(values.hcp_provider_email))
      payload.hcp_provider_email = trim(values.hcp_provider_email);
    payload.hcp_approval = Boolean(values.hcp_approval);
  }
  return payload;
}

export interface AddressFormProps {
  address?: Address | null;
  defaultType?: "billing" | "shipping";
  onSubmit: (payload: Omit<Address, "id">) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  /** When true, show NDIS and Home Care Package sections (for NDIS Approved / Support Co-ordinator roles) */
  showNdisHcp?: boolean;
}

export default function AddressForm({
  address,
  defaultType = "billing",
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel,
  showNdisHcp = false,
}: AddressFormProps) {
  const isEdit = Boolean(address?.id);
  const [openNdisSection, setOpenNdisSection] = useState(false);
  const [openHcpSection, setOpenHcpSection] = useState(false);
  const fieldIdPrefix = `address_${address?.id ?? "new"}_`;
  const lastResetAddressIdRef = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
    setError,
  } = useForm<AddressFormValues>({
    defaultValues: address
      ? {
          ...defaultValues(address.type),
          ...address,
          company: address.company ?? "",
          label: address.label ?? "",
          address_2: address.address_2 ?? "",
          email: address.email ?? "",
          phone: address.phone ?? "",
          ndis_participant_name: address.ndis_participant_name ?? "",
          ndis_number: address.ndis_number ?? "",
          ndis_dob: address.ndis_dob ?? "",
          ndis_funding_type: address.ndis_funding_type ?? "",
          ndis_approval: Boolean(address.ndis_approval),
          ndis_invoice_email: address.ndis_invoice_email ?? "",
          hcp_participant_name: address.hcp_participant_name ?? "",
          hcp_number: address.hcp_number ?? "",
          hcp_provider_email: address.hcp_provider_email ?? "",
          hcp_approval: Boolean(address.hcp_approval),
        }
      : defaultValues(defaultType),
  });

  useEffect(() => {
    const addressId = address?.id != null ? String(address.id) : null;
    if (!addressId) {
      lastResetAddressIdRef.current = null;
      return;
    }
    if (lastResetAddressIdRef.current === addressId) return;
    lastResetAddressIdRef.current = addressId;
    reset({
      ...defaultValues(address.type),
      type: address.type,
      label: address.label ?? "",
      first_name: address.first_name ?? "",
      last_name: address.last_name ?? "",
      company: address.company ?? "",
      address_1: address.address_1 ?? "",
      address_2: address.address_2 ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      postcode: address.postcode ?? "",
      country: address.country ?? "AU",
      email: address.email ?? "",
      phone: address.phone ?? "",
      ndis_participant_name: address.ndis_participant_name ?? "",
      ndis_number: address.ndis_number ?? "",
      ndis_dob: address.ndis_dob ?? "",
      ndis_funding_type: address.ndis_funding_type ?? "",
      ndis_approval: Boolean(address.ndis_approval),
      ndis_invoice_email: address.ndis_invoice_email ?? "",
      hcp_participant_name: address.hcp_participant_name ?? "",
      hcp_number: address.hcp_number ?? "",
      hcp_provider_email: address.hcp_provider_email ?? "",
      hcp_approval: Boolean(address.hcp_approval),
    });
  }, [address, reset]);

  const handleFormSubmit = (values: AddressFormValues) => {
    if (!values.first_name?.trim()) {
      setError("first_name", { message: "Required" });
      return;
    }
    if (!isValidName(values.first_name)) {
      setError("first_name", { message: "Letters, spaces, hyphens and apostrophes only" });
      return;
    }
    if (!values.last_name?.trim()) {
      setError("last_name", { message: "Required" });
      return;
    }
    if (!isValidName(values.last_name)) {
      setError("last_name", { message: "Letters, spaces, hyphens and apostrophes only" });
      return;
    }
    if (!values.address_1?.trim()) {
      setError("address_1", { message: "Required" });
      return;
    }
    if (!values.city?.trim()) {
      setError("city", { message: "Required" });
      return;
    }
    if (!values.state?.trim()) {
      setError("state", { message: "Required" });
      return;
    }
    if (!values.postcode?.trim()) {
      setError("postcode", { message: "Required" });
      return;
    }
    if (!values.country?.trim()) {
      setError("country", { message: "Required" });
      return;
    }
    if (values.email?.trim() && !isValidEmail(values.email)) {
      setError("email", { message: "Invalid email format" });
      return;
    }
    if (values.phone?.trim() && !isValidAuPhone(values.phone)) {
      setError("phone", { message: "Phone must be 8–10 digits" });
      return;
    }
    const payload = toPayload(values, showNdisHcp);
    onSubmit(payload);
  };

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-4"
      id={`${fieldIdPrefix}form`}
      aria-label="Address form"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${fieldIdPrefix}type`}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Type
          </label>
          <select
            id={`${fieldIdPrefix}type`}
            {...register("type")}
            disabled={isLoading}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
            aria-required="true"
          >
            <option value="billing">Billing</option>
            <option value="shipping">Shipping</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={`${fieldIdPrefix}label`}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Label (e.g. Home, Office)
          </label>
          <input
            id={`${fieldIdPrefix}label`}
            type="text"
            {...register("label")}
            placeholder="Home"
            disabled={isLoading}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROW2.map(({ key, label, required }) => (
          <div key={key} id={`${fieldIdPrefix}${key}_field`}>
            <label
              htmlFor={`${fieldIdPrefix}${key}`}
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {label}
              {required && <span className="text-red-500"> *</span>}
            </label>
            <input
              id={`${fieldIdPrefix}${key}`}
              type="text"
              disabled={isLoading}
              {...register(key, { setValueAs: (v) => nameCharsOnly(v || "") })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
              aria-required={required}
              autoComplete={
                key === "first_name"
                  ? "given-name"
                  : key === "last_name"
                    ? "family-name"
                    : undefined
              }
            />
            {errors[key]?.message && (
              <p className="mt-1 text-xs text-red-600">{String(errors[key]?.message)}</p>
            )}
          </div>
        ))}
      </div>
      {ROW3.map(({ key, label }) => (
        <div key={key} id={`${fieldIdPrefix}${key}_field`}>
          <label
            htmlFor={`${fieldIdPrefix}${key}`}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
          <input
            id={`${fieldIdPrefix}${key}`}
            type="text"
            disabled={isLoading}
            {...register(key)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
            autoComplete="organization"
          />
        </div>
      ))}
      {ROW4.map(({ key, label, required }) => (
        <div key={key} id={`${fieldIdPrefix}${key}_field`}>
          <label
            htmlFor={`${fieldIdPrefix}${key}`}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500"> *</span>}
          </label>
          <Controller
            name={key}
            control={control}
            render={({ field }) => (
              <AddressAutocomplete
                id={`${fieldIdPrefix}${key}`}
                value={field.value}
                onChange={field.onChange}
                onPlaceSelect={(addr) => {
                  setValue("address_1", addr.address_1);
                  if (addr.address_2) setValue("address_2", addr.address_2);

                  if (addr.city) setValue("city", addr.city);
                  if (addr.state) setValue("state", addr.state);
                  if (addr.postcode) setValue("postcode", addr.postcode);

                  setValue("country", "AU");
                }}
                disabled={isLoading}
                error={!!errors[key]?.message}
                aria-label="Address line 1"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
              />
            )}
          />
          {errors[key]?.message && (
            <p className="mt-1 text-xs text-red-600">{String(errors[key]?.message)}</p>
          )}
        </div>
      ))}
      {ROW5.map(({ key, label }) => (
        <div key={key} id={`${fieldIdPrefix}${key}_field`}>
          <label
            htmlFor={`${fieldIdPrefix}${key}`}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
          <input
            id={`${fieldIdPrefix}${key}`}
            type="text"
            disabled={isLoading}
            {...register(key)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
            autoComplete="address-line2"
          />
        </div>
      ))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ROW6.map(({ key, label, required }) => (
          <div key={key} id={`${fieldIdPrefix}${key}_field`}>
            <label
              htmlFor={`${fieldIdPrefix}${key}`}
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {label}
              {required && <span className="text-red-500"> *</span>}
            </label>
            <input
              id={`${fieldIdPrefix}${key}`}
              type="text"
              disabled={isLoading}
              {...register(key)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
              aria-required={required}
              autoComplete={
                key === "postcode"
                  ? "postal-code"
                  : key === "state"
                    ? "address-level1"
                    : "address-level2"
              }
            />
            {errors[key]?.message && (
              <p className="mt-1 text-xs text-red-600">{String(errors[key]?.message)}</p>
            )}
          </div>
        ))}
      </div>
      <div id={`${fieldIdPrefix}country_field`}>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Country <span className="text-red-500">*</span>
        </label>

        {/* Hidden value sent to backend */}
        <input type="hidden" value="AU" {...register("country")} />

        {/* Visible field */}
        <input
          type="text"
          value="Australia"
          disabled
          className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm"
        />

        {errors.country?.message && (
          <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROW8.map(({ key, label, type = "text" }) => (
          <div key={key} id={`${fieldIdPrefix}${key}_field`}>
            <label
              htmlFor={`${fieldIdPrefix}${key}`}
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {label}
            </label>
            <input
              id={`${fieldIdPrefix}${key}`}
              type={type}
              disabled={isLoading}
              maxLength={key === "phone" ? 10 : undefined}
              {...register(
                key,
                key === "phone"
                  ? { setValueAs: (v) => digitsOnly(v || "").slice(0, 10) }
                  : undefined
              )}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
              autoComplete={key === "email" ? "email" : key === "phone" ? "tel" : undefined}
            />
            {errors[key]?.message && (
              <p className="mt-1 text-xs text-red-600">{String(errors[key]?.message)}</p>
            )}
          </div>
        ))}
      </div>

      {showNdisHcp && (
        <div className="mt-6 space-y-4 border-t border-gray-200 pt-6">
          <div className="rounded-lg border border-gray-200 bg-gray-50/50">
            <button
              type="button"
              onClick={() => setOpenNdisSection((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-gray-700">Enter your NDIS information</span>
              <span className="text-sm text-gray-500">{openNdisSection ? "−" : "+"}</span>
            </button>
            {openNdisSection && (
              <div className="border-t border-gray-200 bg-white px-4 py-4">
                <p className="mb-4 text-xs text-gray-500">
                  Add your NDIS information for this address.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}ndis_participant_name_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}ndis_participant_name`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Participants Full Name
                    </label>
                    <input
                      id={`${fieldIdPrefix}ndis_participant_name`}
                      type="text"
                      disabled={isLoading}
                      {...register("ndis_participant_name")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div id={`${fieldIdPrefix}ndis_number_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}ndis_number`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      NDIS Number
                    </label>
                    <input
                      id={`${fieldIdPrefix}ndis_number`}
                      type="text"
                      disabled={isLoading}
                      {...register("ndis_number")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div id={`${fieldIdPrefix}ndis_dob_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}ndis_dob`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Participant&apos;s Date Of Birth
                    </label>
                    <input
                      id={`${fieldIdPrefix}ndis_dob`}
                      type="text"
                      disabled={isLoading}
                      {...register("ndis_dob")}
                      placeholder="dd-mm-yyyy"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}ndis_funding_type_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}ndis_funding_type`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      NDIS Funding Type
                    </label>
                    <select
                      id={`${fieldIdPrefix}ndis_funding_type`}
                      disabled={isLoading}
                      {...register("ndis_funding_type")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Please Choose</option>
                      <option value="self_managed">Self Managed</option>
                      <option value="plan_managed">Plan Managed</option>
                      <option value="agency_managed">Agency Managed</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}ndis_invoice_email_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}ndis_invoice_email`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      NDIS Invoice Email
                    </label>
                    <input
                      id={`${fieldIdPrefix}ndis_invoice_email`}
                      type="email"
                      disabled={isLoading}
                      {...register("ndis_invoice_email")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Email for NDIS invoices"
                    />
                  </div>
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}ndis_approval_field`}>
                    <label className="flex items-start gap-2">
                      <Controller
                        name="ndis_approval"
                        control={control}
                        render={({ field: { value, onChange, ...rest } }) => (
                          <input
                            id={`${fieldIdPrefix}ndis_approval`}
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => onChange(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                            disabled={isLoading}
                            {...rest}
                          />
                        )}
                      />
                      <span className="text-sm text-gray-700">
                        I approve this order to be paid using my / the Participant&apos;s NDIS
                        funding.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50/50">
            <button
              type="button"
              onClick={() => setOpenHcpSection((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-gray-700">
                Enter your Home Care Package information
              </span>
              <span className="text-sm text-gray-500">{openHcpSection ? "−" : "+"}</span>
            </button>
            {openHcpSection && (
              <div className="border-t border-gray-200 bg-white px-4 py-4">
                <p className="mb-4 text-xs text-gray-500">
                  Enter their details to get access to their package.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}hcp_participant_name_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}hcp_participant_name`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Participants Full Name
                    </label>
                    <input
                      id={`${fieldIdPrefix}hcp_participant_name`}
                      type="text"
                      disabled={isLoading}
                      {...register("hcp_participant_name")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div id={`${fieldIdPrefix}hcp_number_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}hcp_number`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      HCP Number
                    </label>
                    <input
                      id={`${fieldIdPrefix}hcp_number`}
                      type="text"
                      disabled={isLoading}
                      {...register("hcp_number")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div id={`${fieldIdPrefix}hcp_provider_email_field`}>
                    <label
                      htmlFor={`${fieldIdPrefix}hcp_provider_email`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Provider Payment Email
                    </label>
                    <input
                      id={`${fieldIdPrefix}hcp_provider_email`}
                      type="email"
                      disabled={isLoading}
                      {...register("hcp_provider_email")}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2" id={`${fieldIdPrefix}hcp_approval_field`}>
                    <label className="flex items-start gap-2">
                      <Controller
                        name="hcp_approval"
                        control={control}
                        render={({ field: { value, onChange, ...rest } }) => (
                          <input
                            id={`${fieldIdPrefix}hcp_approval`}
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => onChange(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                            disabled={isLoading}
                            {...rest}
                          />
                        )}
                      />
                      <span className="text-sm text-gray-700">
                        I approve this order to be paid using my / the Participant&apos;s HCP
                        funding.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Saving…" : (submitLabel ?? (isEdit ? "Update address" : "Add address"))}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
