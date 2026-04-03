"use client";

import Image from "next/image";
import {
  PARCEL_PROTECTION_FEE_AUD,
  PARCEL_PROTECTION_ICON_URL,
  type InsuranceOption,
} from "@/lib/checkout-parcel-protection";
import { formatPrice } from "@/lib/format-utils";

type ParcelProtectionProps = {
  insurance_option: InsuranceOption;
  onInsuranceChange: (value: InsuranceOption) => void;
};

export default function ParcelProtection({
  insurance_option,
  onInsuranceChange,
}: ParcelProtectionProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="relative mt-0.5 h-10 w-10 flex-shrink-0" aria-hidden="true">
          <Image
            src={PARCEL_PROTECTION_ICON_URL}
            alt=""
            width={40}
            height={40}
            className="object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Parcel Protection</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            Give your parcel protection against loss, theft or damage in transit.
          </p>
        </div>
      </div>

      <label
        htmlFor="checkout-parcel-protection-select"
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700"
      >
        Coverage
      </label>
      <select
        id="checkout-parcel-protection-select"
        value={insurance_option}
        onChange={(e) => onInsuranceChange(e.target.value as InsuranceOption)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus-visible:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        <option value="no">No</option>
        <option value="yes">Yes ({formatPrice(PARCEL_PROTECTION_FEE_AUD)})</option>
      </select>
      <p className="mt-2 text-xs text-gray-700">
        Optional. Fee is added to your order total when you select Yes.
      </p>
    </div>
  );
}
