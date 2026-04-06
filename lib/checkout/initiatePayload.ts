import { z } from "zod";
import type { CheckoutInitiatePayload } from "@/types/checkout";

const addressSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  address_1: z.string().trim().min(1),
  address_2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().optional(),
  postcode: z.string().trim().min(1),
  country: z.string().trim().min(2),
});

const cartLineSchema = z
  .object({
    product_id: z.number().int().positive().optional(),
    variation_id: z.number().int().positive().optional(),
    quantity: z.number().int().positive(),
    sku: z.string().trim().optional(),
  })
  .refine(
    (row) =>
      (typeof row.sku === "string" && row.sku.length > 0) ||
      (row.product_id != null && row.product_id > 0),
    { message: "Each line item must include a SKU or a positive product_id." }
  );

const paymentMethodSchema = z.preprocess((v) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  // UI may say "on account"; Woo only accepts gateway id `cod`. Never forward `on_account` to Woo.
  if (s === "on_account" || s === "pay_on_account" || s === "account") return "cod";
  return v;
}, z.enum(["eway", "cod"]));

export const checkoutInitiateSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
  line_items: z.array(cartLineSchema).min(1),
  shipping_method_id: z.string().trim().min(1),
  payment_method: paymentMethodSchema,
  /** Matches Woo Store API; optional on headless REST checkout. */
  payment_data: z.array(z.unknown()).optional(),
  coupon_code: z.string().trim().optional(),
  insurance_option: z.enum(["yes", "no"]).optional(),
  ndis_type: z.string().trim().optional(),
  ndis_info: z.string().trim().max(8000).optional(),
  hcp_info: z.string().trim().max(8000).optional(),
  delivery_authority: z.string().trim().max(120).optional(),
  no_paperwork: z.boolean().optional(),
  discreet_packaging: z.boolean().optional(),
  newsletter: z.boolean().optional(),
  delivery_notes: z.string().trim().max(2000).optional(),
});

export function parseCheckoutPayload(input: unknown): CheckoutInitiatePayload {
  return checkoutInitiateSchema.parse(input) as CheckoutInitiatePayload;
}
