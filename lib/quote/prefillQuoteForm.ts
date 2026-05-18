import type { UseFormSetValue } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import { normalizeCountryCode } from "@/lib/checkout/normalizeCountry";
import { mapClaimWhoToFundingType } from "./quoteNdisPayload";
import type { QuoteFormData } from "./schema";

export function applyUserProfileToQuoteForm(
  setValue: UseFormSetValue<QuoteFormData>,
  user: { name?: string | null; email?: string | null },
): void {
  const email = user.email?.trim();
  if (email) setValue("billing_email", email, { shouldDirty: false });

  const name = user.name?.trim();
  if (!name) return;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 1) setValue("billing_first_name", parts[0], { shouldDirty: false });
  if (parts.length >= 2) setValue("billing_last_name", parts.slice(1).join(" "), { shouldDirty: false });
}

export function applyShippingAddressToQuoteForm(
  setValue: UseFormSetValue<QuoteFormData>,
  address: Address,
): void {
  const countryNorm = normalizeCountryCode(address.country || "AU");
  if (address.first_name) setValue("billing_first_name", address.first_name, { shouldDirty: false });
  if (address.last_name) setValue("billing_last_name", address.last_name, { shouldDirty: false });
  if (address.email) setValue("billing_email", address.email, { shouldDirty: false });
  if (address.phone) setValue("billing_phone", address.phone, { shouldDirty: false });
  if (address.company) setValue("billing_company", address.company, { shouldDirty: false });
  setValue("shipping_address_1", address.address_1, { shouldDirty: false });
  setValue("shipping_address_2", address.address_2 || "", { shouldDirty: false });
  setValue("shipping_city", address.city, { shouldDirty: false });
  setValue("shipping_state", address.state, { shouldDirty: false });
  setValue("shipping_postcode", address.postcode, { shouldDirty: false });
  setValue("shipping_country", countryNorm, { shouldDirty: false });

  if (address.ndis_participant_name) {
    setValue("cust_woo_ndis_participant_name", address.ndis_participant_name, { shouldDirty: false });
  }
  if (address.ndis_number) setValue("cust_woo_ndis_number", address.ndis_number, { shouldDirty: false });
  if (address.ndis_dob) setValue("cust_woo_ndis_dob", address.ndis_dob, { shouldDirty: false });
  if (address.ndis_funding_type) {
    setValue("cust_woo_ndis_funding_type", address.ndis_funding_type, { shouldDirty: false });
    const ft = address.ndis_funding_type;
    if (ft === "self_managed") setValue("quote_ndis_claim_who", "self", { shouldDirty: false });
    else if (ft === "agency_managed") setValue("quote_ndis_claim_who", "joyamedical", { shouldDirty: false });
    else if (ft === "plan_managed") setValue("quote_ndis_claim_who", "plan_manager", { shouldDirty: false });
  }
}

export function syncFundingTypeFromClaimWho(
  setValue: UseFormSetValue<QuoteFormData>,
  claimWho: string,
): void {
  const funding = mapClaimWhoToFundingType(claimWho);
  if (funding) setValue("cust_woo_ndis_funding_type", funding, { shouldDirty: true });
}
