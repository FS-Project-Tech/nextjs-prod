import type { UseFormSetValue } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import type { CheckoutFormData } from "./schema";
import { normalizeCountryCode } from "./normalizeCountry";

export function applySavedBillingAddress(
  setValue: UseFormSetValue<CheckoutFormData>,
  address: Address
): void {
  const countryNorm = normalizeCountryCode(address.country || "AU");
  setValue("billing_first_name", address.first_name, { shouldDirty: true });
  setValue("billing_last_name", address.last_name, { shouldDirty: true });
  setValue("billing_email", address.email || "", { shouldDirty: true });
  setValue("billing_phone", address.phone || "", { shouldDirty: true });
  setValue("billing_company", address.company || "", { shouldDirty: true });
  setValue("billing_address_1", address.address_1, { shouldDirty: true });
  setValue("billing_address_2", address.address_2 || "", { shouldDirty: true });
  setValue("billing_city", address.city, { shouldDirty: true });
  setValue("billing_state", address.state, { shouldDirty: true });
  setValue("billing_postcode", address.postcode, { shouldDirty: true });
  setValue("billing_country", countryNorm, { shouldDirty: true });
  setValue("cust_woo_ndis_participant_name", address.ndis_participant_name || "", {
    shouldDirty: true,
  });
  setValue("cust_woo_ndis_number", address.ndis_number || "", { shouldDirty: true });
  setValue("cust_woo_ndis_dob", address.ndis_dob || "", { shouldDirty: true });
  setValue("cust_woo_ndis_funding_type", address.ndis_funding_type || "", { shouldDirty: true });
  setValue("cust_woo_ndis_approval", Boolean(address.ndis_approval), { shouldDirty: true });
  setValue(
    "cust_woo_invoice_email",
    (address as { ndis_invoice_email?: string }).ndis_invoice_email || "",
    { shouldDirty: true }
  );
  setValue("cust_woo_hcp_participant_name", address.hcp_participant_name || "", {
    shouldDirty: true,
  });
  setValue("cust_woo_hcp_number", address.hcp_number || "", { shouldDirty: true });
  setValue("cust_woo_provider_email", address.hcp_provider_email || "", { shouldDirty: true });
  setValue("cust_woo_hcp_approval", Boolean(address.hcp_approval), { shouldDirty: true });
}

export function clearBillingAddressFields(setValue: UseFormSetValue<CheckoutFormData>): void {
  setValue("billing_first_name", "");
  setValue("billing_last_name", "");
  setValue("billing_email", "");
  setValue("billing_phone", "");
  setValue("billing_company", "");
  setValue("billing_address_1", "");
  setValue("billing_address_2", "");
  setValue("billing_city", "");
  setValue("billing_state", "");
  setValue("billing_postcode", "");
  setValue("billing_country", "AU");
  setValue("cust_woo_ndis_participant_name", "");
  setValue("cust_woo_ndis_number", "");
  setValue("cust_woo_ndis_dob", "");
  setValue("cust_woo_ndis_funding_type", "");
  setValue("cust_woo_ndis_approval", false);
  setValue("cust_woo_invoice_email", "");
  setValue("cust_woo_hcp_participant_name", "");
  setValue("cust_woo_hcp_number", "");
  setValue("cust_woo_provider_email", "");
  setValue("cust_woo_hcp_approval", false);
}

export function applySavedShippingAddress(
  setValue: UseFormSetValue<CheckoutFormData>,
  address: Address
): void {
  const countryNorm = normalizeCountryCode(address.country || "AU");
  setValue("shipping_first_name", address.first_name, { shouldDirty: true });
  setValue("shipping_last_name", address.last_name, { shouldDirty: true });
  setValue("shipping_company", address.company || "", { shouldDirty: true });
  setValue("shipping_address_1", address.address_1, { shouldDirty: true });
  setValue("shipping_address_2", address.address_2 || "", { shouldDirty: true });
  setValue("shipping_city", address.city, { shouldDirty: true });
  setValue("shipping_state", address.state, { shouldDirty: true });
  setValue("shipping_postcode", address.postcode, { shouldDirty: true });
  setValue("shipping_country", countryNorm, { shouldDirty: true });
}

export function clearShippingAddressFields(setValue: UseFormSetValue<CheckoutFormData>): void {
  setValue("shipping_first_name", "", { shouldDirty: true });
  setValue("shipping_last_name", "", { shouldDirty: true });
  setValue("shipping_company", "", { shouldDirty: true });
  setValue("shipping_address_1", "", { shouldDirty: true });
  setValue("shipping_address_2", "", { shouldDirty: true });
  setValue("shipping_city", "", { shouldDirty: true });
  setValue("shipping_state", "", { shouldDirty: true });
  setValue("shipping_postcode", "", { shouldDirty: true });
  setValue("shipping_country", "AU", { shouldDirty: true });
}
