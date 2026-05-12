/**
 * Example client handler: POST the same JSON shape as production checkout.
 * Build the body with {@link buildCreateOrderPayload} from form state + Zustand cart lines.
 */
import type { CartItem } from "@/lib/types/cart";
import { buildCreateOrderPayload } from "@/lib/checkout/buildCreateOrderPayload";
import type { CheckoutFormData } from "@/lib/checkout/schema";

export type ExampleSubmitResult =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; status: number; message: string };

/**
 * Calls `POST /api/checkout` with credentials (session cookies when logged in).
 * For eWAY responses, read `redirect_url` or `data.url` and `window.location.assign`.
 */
export async function exampleSubmitHeadlessCheckout(input: {
  form: CheckoutFormData;
  cartLines: CartItem[];
  paymentMethod: "eway" | "cod";
  appliedCouponCode?: string | null;
  couponFromUrl?: string | null;
}): Promise<ExampleSubmitResult> {
  const { form, cartLines, paymentMethod, appliedCouponCode, couponFromUrl } = input;
  const payload = buildCreateOrderPayload({
    data: form,
    cartLines,
    paymentMethod,
    appliedCouponCode: appliedCouponCode ?? null,
    couponFromUrl: couponFromUrl ?? null,
  });

  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include",
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof json.error === "string" && json.error) ||
      (typeof json.message === "string" && json.message) ||
      `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg };
  }
  return { ok: true, json };
}
