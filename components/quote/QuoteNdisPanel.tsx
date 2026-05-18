"use client";

import { useState } from "react";
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
} from "react-hook-form";
import type { QuoteFormData } from "@/lib/quote/schema";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";
import { syncFundingTypeFromClaimWho } from "@/lib/quote/prefillQuoteForm";

const CLAIM_OPTIONS = [
  { value: "self", label: "I will claim for myself" },
  { value: "joyamedical", label: "Joyamedical to claim for me" },
  { value: "plan_manager", label: "A plan manager will claim" },
] as const;

export default function QuoteNdisPanel({
  control,
  errors,
  setValue,
  onBack,
}: {
  control: Control<QuoteFormData>;
  errors: FieldErrors<QuoteFormData>;
  setValue: UseFormSetValue<QuoteFormData>;
  onBack: () => void;
}) {
  const [nameRequiredVisible, setNameRequiredVisible] = useState(false);
  const participantName =
    useWatch({ control, name: "cust_woo_ndis_participant_name", defaultValue: "" }) ?? "";
  const canSave = String(participantName).trim().length > 0;

  const handleSave = () => {
    if (!canSave) {
      setNameRequiredVisible(true);
      return;
    }
    setNameRequiredVisible(false);
    onBack();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
          aria-label="Back to quote"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="flex-1 text-center text-base font-bold text-gray-900 pr-9">NDIS Options</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 space-y-6 sm:px-6">
        <div>
          <p className="mb-3 text-sm font-semibold text-gray-900">Who Will Claim From NDIS?</p>
          <Controller
            name="quote_ndis_claim_who"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                {CLAIM_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={opt.value}
                      checked={field.value === opt.value}
                      onChange={() => {
                        field.onChange(opt.value);
                        syncFundingTypeFromClaimWho(setValue, opt.value);
                      }}
                      className={`h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">
              NDIS Participant Name
            </label>
            <Controller
              name="cust_woo_ndis_participant_name"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  placeholder="Name"
                  onChange={(e) => {
                    field.onChange(e);
                    if (e.target.value.trim()) setNameRequiredVisible(false);
                  }}
                  aria-invalid={nameRequiredVisible ? "true" : "false"}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm ${FOCUS_RING} ${
                    nameRequiredVisible || errors.cust_woo_ndis_participant_name
                      ? "border-gray-900"
                      : "border-gray-300"
                  }`}
                />
              )}
            />
            {nameRequiredVisible && (
              <p className="mt-1 text-xs text-rose-700">Name field is required</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">
              NDIS Participant Number
            </label>
            <Controller
              name="cust_woo_ndis_number"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  placeholder="Number"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm ${FOCUS_RING}`}
                />
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">
              NDIS Participant D.O.B.
            </label>
            <Controller
              name="cust_woo_ndis_dob"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm ${FOCUS_RING}`}
                />
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Plan Start Date</label>
            <Controller
              name="quote_ndis_plan_start"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm ${FOCUS_RING}`}
                />
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Plan End Date</label>
            <Controller
              name="quote_ndis_plan_end"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="date"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm ${FOCUS_RING}`}
                />
              )}
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className={`flex-1 rounded-lg border border-gray-900 bg-white py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 ${FOCUS_RING}`}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`flex-1 rounded-lg py-3 text-sm font-semibold transition-colors ${FOCUS_RING} ${
              canSave
                ? "bg-gray-900 text-white hover:bg-black"
                : "cursor-not-allowed bg-gray-300 text-white"
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
