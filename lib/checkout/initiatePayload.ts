import { z } from "zod";
import type { CheckoutInitiatePayload } from "@/types/checkout";

/** Mirrors Zustand `CartItem` for checkout POST (extra keys allowed). */
const checkoutPayloadCartItemSchema = z
  .object({
    id: z.string().min(1),
    productId: z.number().int().positive(),
    variationId: z.number().int().positive().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    price: z.union([z.string(), z.number()]),
    qty: z.number().int().positive(),
    sku: z.union([z.string(), z.null()]).optional(),
    tax_class: z.string().optional(),
    tax_status: z.string().optional(),
    attributes: z.record(z.string(), z.string()).optional(),
    imageUrl: z.string().optional(),
    deliveryPlan: z.enum(["none", "7", "14", "30"]).optional(),
    wc_store_item_key: z.string().optional(),
  })
  .passthrough();

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

export const checkoutCartLineSchema = z
  .object({
    product_id: z.number().int().positive().optional(),
    variation_id: z.number().int().positive().optional(),
    quantity: z.number().int().positive(),
    sku: z.string().trim().optional(),
    unit_price: z
      .union([z.number(), z.string()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null) return undefined;
        const n = typeof v === "number" ? v : Number.parseFloat(String(v).trim());
        return Number.isFinite(n) && n > 0 ? n : undefined;
      }),
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

export const checkoutInitiateSchema = z
  .object({
    billing: addressSchema,
    shipping: addressSchema,
    line_items: z.array(checkoutCartLineSchema).min(1),
    cart_items: z.array(checkoutPayloadCartItemSchema).optional(),
    shipping_method_id: z.string().trim().min(1),
    payment_method: paymentMethodSchema,
  checkout_session_id: z.string().uuid().optional(),
  checkout_resume: z
    .object({
      order_id: z.number().int().positive(),
      order_key: z.string().trim().min(8),
    })
    .optional(),
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
  })
  .superRefine((data, ctx) => {
    if (data.payment_method === "eway") {
      if (!data.cart_items || data.cart_items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "cart_items is required for card checkout (send current Zustand cart lines for server validation).",
          path: ["cart_items"],
        });
      }
    }
  });

export function parseCheckoutPayload(input: unknown): CheckoutInitiatePayload {
  return checkoutInitiateSchema.parse(input) as CheckoutInitiatePayload;
}

/** PDP-style totals preview — same pricing as create-order (no PII required beyond shipping locale). */
export const checkoutQuoteTotalsSchema = z.object({
  line_items: z.array(checkoutCartLineSchema).min(1),
  shipping_method_id: z.string().trim().min(1),
  shipping: z.object({
    country: z.string().trim().min(2),
    state: z.string().trim().optional().default(""),
    postcode: z.string().trim().optional().default(""),
    city: z.string().trim().optional().default(""),
  }),
  coupon_code: z.string().trim().optional(),
  insurance_option: z.enum(["yes", "no"]).optional(),
});

export type CheckoutQuoteTotalsInput = z.infer<typeof checkoutQuoteTotalsSchema>;

export function parseCheckoutQuoteTotalsInput(input: unknown): CheckoutQuoteTotalsInput {
  return checkoutQuoteTotalsSchema.parse(input);
}
