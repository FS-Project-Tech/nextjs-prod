"use client";

import { useWatch } from "react-hook-form";
import type { Control, UseFormSetValue } from "react-hook-form";
import { normalizeCountryCode } from "@/lib/checkout/normalizeCountry";
import { useMirrorBillingToShipping } from "@/lib/checkout/useCheckoutSideEffects";
import type { CheckoutFormData } from "@/lib/checkout/schema";

/**
 * Subscribes only to billing + shipToDifferent fields so the checkout shell does not re-render on every keystroke.
 */
export function useBillingMirror(
  control: Control<CheckoutFormData>,
  setValue: UseFormSetValue<CheckoutFormData>
): boolean {
  const shipToDifferent = useWatch({ control, name: "shipToDifferentAddress", defaultValue: false });
  const billing_first_name = useWatch({ control, name: "billing_first_name", defaultValue: "" });
  const billing_last_name = useWatch({ control, name: "billing_last_name", defaultValue: "" });
  const billing_company = useWatch({ control, name: "billing_company", defaultValue: "" });
  const billing_address_1 = useWatch({ control, name: "billing_address_1", defaultValue: "" });
  const billing_address_2 = useWatch({ control, name: "billing_address_2", defaultValue: "" });
  const billing_city = useWatch({ control, name: "billing_city", defaultValue: "" });
  const billing_postcode = useWatch({ control, name: "billing_postcode", defaultValue: "" });
  const billing_country = useWatch({ control, name: "billing_country", defaultValue: "AU" });
  const billing_state = useWatch({ control, name: "billing_state", defaultValue: "" });

  const billingCountry = normalizeCountryCode(billing_country || "");

  useMirrorBillingToShipping(
    Boolean(shipToDifferent),
    billing_first_name ?? "",
    billing_last_name ?? "",
    billing_company ?? "",
    billing_address_1 ?? "",
    billing_address_2 ?? "",
    billing_city ?? "",
    billing_postcode ?? "",
    billingCountry,
    billing_state ?? "",
    setValue
  );

  return Boolean(shipToDifferent);
}
