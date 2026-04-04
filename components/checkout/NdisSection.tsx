"use client";

import type { Dispatch, SetStateAction } from "react";
import { Controller, type Control } from "react-hook-form";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { FOCUS_RING_BTN } from "@/lib/checkout/uiConstants";

export type NdisSectionProps = {
  openNdisSection: boolean;
  setOpenNdisSection: Dispatch<SetStateAction<boolean>>;
  openHcpSection: boolean;
  setOpenHcpSection: Dispatch<SetStateAction<boolean>>;
  control: Control<CheckoutFormData>;
  selectedBillingAddressId: string;
};

export default function NdisSection({
  openNdisSection,
  setOpenNdisSection,
  openHcpSection,
  setOpenHcpSection,
  control,
  selectedBillingAddressId,
}: NdisSectionProps) {
  return (
    <section className="rounded-xl bg-white p-6" aria-label="NDIS and Home Care Package">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50/50">
          <button
            type="button"
            id="checkout-ndis-toggle"
            aria-expanded={openNdisSection}
            aria-controls="checkout-ndis-panel"
            onClick={() => setOpenNdisSection((v) => !v)}
            className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 ${FOCUS_RING_BTN}`}
          >
            <span>Enter your NDIS information</span>
            <span className="text-sm text-gray-600" aria-hidden="true">
              {openNdisSection ? "−" : "+"}
            </span>
          </button>
          <div
            id="checkout-ndis-panel"
            role="region"
            aria-labelledby="checkout-ndis-toggle"
            hidden={!openNdisSection}
            className="border-t border-gray-200 bg-white px-4 py-4"
          >
            <p className="mb-4 text-xs text-gray-500">Add your NDIS information before checkout.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Participants Full Name
                </label>
                <Controller
                  name="cust_woo_ndis_participant_name"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    />
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">NDIS Number</label>
                <Controller
                  name="cust_woo_ndis_number"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${
                        selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""
                      }`}
                    />
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Participant&apos;s Date Of Birth
                </label>
                <Controller
                  name="cust_woo_ndis_dob"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="dd-mm-yyyy"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    />
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  NDIS Funding Type
                </label>
                <Controller
                  name="cust_woo_ndis_funding_type"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    >
                      <option value="">Please Choose</option>
                      <option value="self_managed">Self Managed</option>
                      <option value="plan_managed">Plan Managed</option>
                      <option value="agency_managed">Agency Managed</option>
                    </select>
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  NDIS Invoice Email
                </label>
                <Controller
                  name="cust_woo_invoice_email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      id="billing_ndis_invoice_email"
                      type="email"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                      placeholder="Email for NDIS invoices"
                    />
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2">
                  <Controller
                    name="cust_woo_ndis_approval"
                    control={control}
                    render={({ field: { value, onChange, ...rest } }) => (
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        disabled={!!selectedBillingAddressId}
                        className={`mt-1 h-4 w-4 rounded border-gray-300 ${selectedBillingAddressId ? "cursor-not-allowed" : ""}`}
                        {...rest}
                      />
                    )}
                  />
                  <span className="text-sm text-gray-700">
                    I approve this order to be paid using my / the Participant&apos;s NDIS funding.
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/50">
          <button
            type="button"
            id="checkout-hcp-toggle"
            aria-expanded={openHcpSection}
            aria-controls="checkout-hcp-panel"
            onClick={() => setOpenHcpSection((v) => !v)}
            className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 ${FOCUS_RING_BTN}`}
          >
            <span>Enter your Home Care Package information</span>
            <span className="text-sm text-gray-600" aria-hidden="true">
              {openHcpSection ? "−" : "+"}
            </span>
          </button>
          <div
            id="checkout-hcp-panel"
            role="region"
            aria-labelledby="checkout-hcp-toggle"
            hidden={!openHcpSection}
            className="border-t border-gray-200 bg-white px-4 py-4"
          >
            <p className="mb-4 text-xs text-gray-500">
              Enter their details to get access to their package.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Participants Full Name
                </label>
                <Controller
                  name="cust_woo_hcp_participant_name"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    />
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">HCP Number</label>
                <Controller
                  name="cust_woo_hcp_number"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    />
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Provider Payment Email
                </label>
                <Controller
                  name="cust_woo_provider_email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      disabled={!!selectedBillingAddressId}
                      className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddressId ? "cursor-not-allowed bg-gray-100" : ""}`}
                    />
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2">
                  <Controller
                    name="cust_woo_hcp_approval"
                    control={control}
                    render={({ field: { value, onChange, ...rest } }) => (
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        disabled={!!selectedBillingAddressId}
                        className={`mt-1 h-4 w-4 rounded border-gray-300 ${selectedBillingAddressId ? "cursor-not-allowed" : ""}`}
                        {...rest}
                      />
                    )}
                  />
                  <span className="text-sm text-gray-700">
                    I approve this order to be paid using my / the Participant&apos;s HCP funding.
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
