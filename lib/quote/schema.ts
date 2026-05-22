import * as yup from "yup";
import { isValidName, isValidAuPhone } from "@/lib/form-validation";

/** Checkout-aligned field names for quote requests (dashboard + email interop). */
export const quoteFormSchema = yup.object({
  billing_first_name: yup
    .string()
    .required("First name is required")
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v),
    ),
  billing_last_name: yup
    .string()
    .required("Last name is required")
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v),
    ),
  billing_email: yup.string().email("Invalid email").required("Email is required"),
  billing_phone: yup
    .string()
    .required("Phone is required")
    .test("phone-format", "Phone must be 8–10 digits", (v) => !v?.trim() || isValidAuPhone(v)),
  billing_company: yup.string().optional(),
  shipping_address_1: yup.string().required("Address is required"),
  shipping_address_2: yup.string().optional(),
  shipping_city: yup.string().required("Suburb is required"),
  shipping_postcode: yup.string().required("Post code is required"),
  shipping_country: yup.string().required("Country is required"),
  shipping_state: yup.string().required("State is required"),
  sameAddressForBilling: yup.boolean().default(true),
  billing_address_1: yup.string().when("sameAddressForBilling", {
    is: false,
    then: (s) => s.required("Address is required"),
    otherwise: (s) => s.optional(),
  }),
  billing_address_2: yup.string().optional(),
  billing_city: yup.string().when("sameAddressForBilling", {
    is: false,
    then: (s) => s.required("Suburb is required"),
    otherwise: (s) => s.optional(),
  }),
  billing_postcode: yup.string().when("sameAddressForBilling", {
    is: false,
    then: (s) => s.required("Post code is required"),
    otherwise: (s) => s.optional(),
  }),
  billing_country: yup.string().when("sameAddressForBilling", {
    is: false,
    then: (s) => s.required("Country is required"),
    otherwise: (s) => s.optional(),
  }),
  billing_state: yup.string().when("sameAddressForBilling", {
    is: false,
    then: (s) => s.required("State is required"),
    otherwise: (s) => s.optional(),
  }),
  quote_notes: yup.string().optional(),
  quote_ndis_claim_who: yup
    .string()
    .oneOf(["", "self", "joyamedical", "plan_manager"] as const)
    .optional(),
  cust_woo_ndis_participant_name: yup.string().optional(),
  cust_woo_ndis_number: yup.string().optional(),
  cust_woo_ndis_dob: yup.string().optional(),
  quote_ndis_plan_start: yup.string().optional(),
  quote_ndis_plan_end: yup.string().optional(),
  cust_woo_ndis_funding_type: yup.string().optional(),
});

export type QuoteFormData = yup.InferType<typeof quoteFormSchema>;
