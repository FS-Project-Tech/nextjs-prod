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

export const checkoutInitiateSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
  line_items: z.array(cartLineSchema).min(1),
  shipping_method_id: z.string().trim().min(1),
  payment_method: z.enum(["eway", "cod"]),
  coupon_code: z.string().trim().optional(),
  insurance_option: z.enum(["yes", "no"]).optional(),
  ndis_type: z.string().trim().optional(),
});

export function parseCheckoutPayload(input: unknown): CheckoutInitiatePayload {
  return checkoutInitiateSchema.parse(input) as CheckoutInitiatePayload;
}
