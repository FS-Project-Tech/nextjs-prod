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

const cartItemSchema = z.object({
  product_id: z.number().int().positive(),
  variation_id: z.number().int().positive().optional(),
  quantity: z.number().int().positive(),
});

export const checkoutInitiateSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
  line_items: z.array(cartItemSchema).min(1),
  shipping_method_id: z.string().trim().min(1),
  payment_method: z.enum(["eway", "on_account"]),
  coupon_code: z.string().trim().optional(),
  insurance_option: z.enum(["yes", "no"]).optional(),
  ndis_type: z.string().trim().optional(),
});

export function parseCheckoutPayload(input: unknown): CheckoutInitiatePayload {
  return checkoutInitiateSchema.parse(input) as CheckoutInitiatePayload;
}

