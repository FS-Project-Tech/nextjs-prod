import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { buildCheckoutQuoteTotalsBody } from "@/lib/checkout/buildCreateOrderPayload";
import type { CheckoutQuoteSigningPayload, CheckoutQuoteSnapshotV1 } from "@/types/checkout";

export type FreshSignedQuoteForCodResult =
  | { ok: true; quote: CheckoutQuoteSigningPayload }
  | { ok: false; error: string };

/**
 * POST /api/checkout/quote-totals immediately before On account (COD) checkout so the signed bundle
 * matches the current cart + shipping and satisfies server-side freshness checks.
 */
export async function fetchFreshSignedQuoteForCodSubmit(args: {
  origin: string;
  data: CheckoutFormData;
  cartLines: CartItem[];
  appliedCoupon: { code: string } | null;
  empowerApplied?: boolean;
}): Promise<FreshSignedQuoteForCodResult> {
  const body = buildCheckoutQuoteTotalsBody({
    data: args.data,
    cartLines: args.cartLines,
    appliedCoupon: args.appliedCoupon,
    empowerApplied: args.empowerApplied,
  });
  if (!body) {
    return { ok: false, error: "Select a shipping method before placing the order." };
  }

  const base = args.origin.replace(/\/+$/, "");
  const url = `${base || ""}/api/checkout/quote-totals`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    quote_signing_configured?: boolean;
    quote_signature?: string;
    quote_snapshot?: CheckoutQuoteSnapshotV1;
  };

  if (!res.ok || !json.success) {
    const msg =
      typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : `Could not refresh order totals (HTTP ${res.status}).`;
    return { ok: false, error: msg };
  }

  if (!json.quote_signature || !json.quote_snapshot) {
    if (json.quote_signing_configured === false) {
      return {
        ok: false,
        error:
          "On account checkout is unavailable: quote signing is not configured on the server. Set CHECKOUT_QUOTE_SIGNING_SECRET or CHECKOUT_SESSION_SERVER_SECRET.",
      };
    }
    return {
      ok: false,
      error: "Order totals did not include a signed quote. Wait for totals to finish loading, then try again.",
    };
  }

  return {
    ok: true,
    quote: { signature: json.quote_signature, snapshot: json.quote_snapshot },
  };
}
