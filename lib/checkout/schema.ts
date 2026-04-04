import * as yup from "yup";
import { isValidName, isValidAuPhone } from "@/lib/form-validation";

export interface ShippingMethodType {
  id: string;
  method_id: string;
  label: string;
  cost: number;
  total: number;
  description?: string;
}

export const checkoutSchema = yup.object({
  billing_first_name: yup
    .string()
    .required("First name is required")
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v)
    ),
  billing_last_name: yup
    .string()
    .required("Last name is required")
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v)
    ),
  billing_email: yup.string().email("Invalid email").required("Email is required"),
  billing_phone: yup
    .string()
    .required("Phone is required")
    .test("phone-format", "Phone must be 8–10 digits", (v) => !v?.trim() || isValidAuPhone(v)),
  billing_company: yup.string().optional(),
  billing_address_1: yup.string().required("Address is required"),
  billing_address_2: yup.string().optional(),
  billing_city: yup.string().required("City is required"),
  billing_postcode: yup.string().required("Postcode is required"),
  billing_country: yup.string().required("Country is required"),
  billing_state: yup.string().required("State is required"),
  shipping_first_name: yup
    .string()
    .optional()
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v)
    ),
  shipping_last_name: yup
    .string()
    .optional()
    .test(
      "name-format",
      "Letters, spaces, hyphens and apostrophes only",
      (v) => !v?.trim() || isValidName(v)
    ),
  shipping_company: yup.string().optional(),
  shipping_address_1: yup.string().optional(),
  shipping_address_2: yup.string().optional(),
  shipping_city: yup.string().optional(),
  shipping_postcode: yup.string().optional(),
  shipping_country: yup.string().optional(),
  shipping_state: yup.string().optional(),
  shippingMethod: yup
    .object<ShippingMethodType>({
      id: yup.string().required(),
      method_id: yup.string().required(),
      label: yup.string().required(),
      cost: yup.number().required(),
      total: yup.number().required(),
      description: yup.string().optional(),
    })
    .required("Please select a shipping method"),
  shipToDifferentAddress: yup.boolean().default(false),
  deliveryAuthority: yup.string().default("with_signature"),
  deliveryInstructions: yup.string().optional(),
  doNotSendPaperwork: yup.boolean().optional(),
  discreetPackaging: yup.boolean().optional(),
  ndis_number: yup.string().optional(),
  ndis_participant_name: yup.string().optional(),
  ndis_dob: yup.string().optional(),
  ndis_funding_type: yup.string().optional(),
  ndis_approval: yup.boolean().optional(),
  billing_ndis_invoice_email: yup.string().email("Invalid email").optional(),
  hcp_number: yup.string().optional(),
  hcp_participant_name: yup.string().optional(),
  hcp_provider_email: yup.string().optional(),
  hcp_approval: yup.boolean().optional(),
  cust_woo_ndis_participant_name: yup.string().optional(),
  cust_woo_ndis_number: yup.string().optional(),
  cust_woo_ndis_dob: yup.string().optional(),
  cust_woo_ndis_funding_type: yup.string().optional(),
  cust_woo_invoice_email: yup.string().email("Invalid email").optional(),
  cust_woo_ndis_approval: yup.boolean().optional(),
  cust_woo_hcp_participant_name: yup.string().optional(),
  cust_woo_hcp_number: yup.string().optional(),
  cust_woo_provider_email: yup.string().optional(),
  cust_woo_hcp_approval: yup.boolean().optional(),
  subscribe_newsletter: yup.boolean().default(false),
  insurance_option: yup.string().oneOf(["yes", "no"] as const).default("no"),
  termsAccepted: yup
    .boolean()
    .oneOf([true], "You must accept the terms and conditions")
    .required(),
});

export type CheckoutFormData = yup.InferType<typeof checkoutSchema>;
