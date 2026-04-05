/**
 * eWAY Rapid API — hosted Shared Page (AccessCodesShared) + AccessCode verification.
 * Single module for all eWAY server calls. @see https://eway.io/api-v3/
 */

import crypto from "crypto";

function paymentReturnVpSig(wooOrderId: string): string | null {
  const secret = process.env.VERIFY_PAYMENT_HMAC_SECRET?.trim();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(String(wooOrderId), "utf8").digest("hex");
}

function ewayApiRoot(): string {
  const sandbox = process.env.EWAY_SANDBOX === "true" || process.env.EWAY_API_ENV === "sandbox";
  return sandbox ? "https://api.sandbox.ewaypayments.com" : "https://api.ewaypayments.com";
}

function publicRedirectBase(): string | null {
  const explicit =
    process.env.EWAY_REDIRECT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_FRONTEND_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^\/+/, "")}`;
  return null;
}

function countryLower(iso: string | undefined): string {
  const c = String(iso || "AU")
    .trim()
    .toLowerCase();
  if (c === "australia") return "au";
  return c.length === 2 ? c : "au";
}

function formatEwayErrors(errors: unknown): string {
  if (errors == null) return "Unknown eWAY error";
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.map(String).join("; ");
  if (typeof errors === "object") return JSON.stringify(errors);
  return String(errors);
}

export function isEwayConfigured(): boolean {
  return Boolean(process.env.EWAY_API_KEY?.trim() && process.env.EWAY_PASSWORD?.trim());
}

/** @deprecated use isEwayConfigured */
export const isEwayRapidConfigured = isEwayConfigured;

export type EwayHostedPaymentInput = {
  wooOrderId: string | number;
  /** WooCommerce REST `order_key` — required for secure return to order review. */
  orderKey: string;
  orderTotal: string;
  currencyCode?: string;
  billing: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
    address_1: string;
    address_2?: string;
    city: string;
    state?: string;
    postcode: string;
    country?: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    state?: string;
    postcode: string;
    country?: string;
  };
  customerIp?: string;
};

export async function createEwayHostedPayment(
  input: EwayHostedPaymentInput
): Promise<
  { ok: true; sharedPaymentUrl: string; accessCode: string } | { ok: false; error: string }
> {
  const apiKey = process.env.EWAY_API_KEY?.trim();
  const apiPassword = process.env.EWAY_PASSWORD?.trim();
  if (!apiKey || !apiPassword) {
    console.warn("[eway] createEwayHostedPayment: credentials missing");
    return { ok: false, error: "eWAY API credentials are not configured." };
  }

  const base = publicRedirectBase();
  if (!base) {
    return {
      ok: false,
      error:
        "Set EWAY_REDIRECT_BASE_URL, NEXT_PUBLIC_SITE_URL, or NEXT_PUBLIC_FRONTEND_URL for eWAY return URLs.",
    };
  }

  const total = Number.parseFloat(String(input.orderTotal));
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: "Invalid Woo order total for eWAY." };
  }
  const totalAmount = Math.round(total * 100);
  const oid = String(input.wooOrderId);
  const keyEnc = encodeURIComponent(input.orderKey.trim());
  const vpSig = paymentReturnVpSig(oid);
  const redirectUrl =
    `${base}/checkout/order-review?orderId=${encodeURIComponent(oid)}&key=${keyEnc}` +
    (vpSig ? `&vp_sig=${encodeURIComponent(vpSig)}` : "");
  const cancelUrl = `${base}/checkout`;

  const body = {
    Customer: {
      FirstName: input.billing.first_name,
      LastName: input.billing.last_name,
      CompanyName: input.billing.company || "",
      Street1: input.billing.address_1,
      Street2: input.billing.address_2 || "",
      City: input.billing.city,
      State: input.billing.state || "",
      PostalCode: input.billing.postcode,
      Country: countryLower(input.billing.country),
      Email: input.billing.email || "",
      Phone: input.billing.phone || "",
    },
    ShippingAddress: {
      FirstName: input.shipping.first_name,
      LastName: input.shipping.last_name,
      Street1: input.shipping.address_1,
      City: input.shipping.city,
      State: input.shipping.state || "",
      Country: countryLower(input.shipping.country),
      PostalCode: input.shipping.postcode,
      Email: input.billing.email || "",
      Phone: input.billing.phone || "",
    },
    Payment: {
      TotalAmount: totalAmount,
      InvoiceNumber: oid.slice(0, 64),
      InvoiceDescription: "Order payment",
      InvoiceReference: oid.slice(0, 50),
      CurrencyCode: (input.currencyCode || "AUD").toUpperCase(),
    },
    RedirectUrl: redirectUrl,
    CancelUrl: cancelUrl,
    TransactionType: "Purchase",
    Method: "ProcessPayment",
    ...(input.customerIp ? { CustomerIP: input.customerIp } : {}),
  };

  console.log("[eway] AccessCodesShared request", {
    wooOrderId: input.wooOrderId,
    totalCents: totalAmount,
    currency: body.Payment.CurrencyCode,
  });

  const auth = Buffer.from(`${apiKey}:${apiPassword}`).toString("base64");
  const endpoint = `${ewayApiRoot()}/AccessCodesShared`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "eWAY request failed";
    console.error("[eway] AccessCodesShared network error", msg);
    return { ok: false, error: msg };
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON from eWAY." };
  }

  const errField = json.Errors;
  const hasErrors =
    errField != null && errField !== "" && !(Array.isArray(errField) && errField.length === 0);
  if (hasErrors) {
    console.error("[eway] AccessCodesShared errors", formatEwayErrors(errField));
    return { ok: false, error: formatEwayErrors(errField) };
  }

  if (!res.ok) {
    const err = formatEwayErrors(json.Errors ?? json) || `eWAY HTTP ${res.status}`;
    console.error("[eway] AccessCodesShared HTTP error", res.status, err);
    return { ok: false, error: err };
  }

  const url = json.SharedPaymentUrl;
  const accessCode = json.AccessCode;
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: "eWAY did not return SharedPaymentUrl." };
  }

  console.log("[eway] AccessCodesShared ok", {
    accessCodeLength: typeof accessCode === "string" ? accessCode.length : 0,
  });

  return {
    ok: true,
    sharedPaymentUrl: url.trim(),
    accessCode: typeof accessCode === "string" ? accessCode : "",
  };
}

/** @deprecated use createEwayHostedPayment */
export const createEwaySharedPaymentUrl = createEwayHostedPayment;

/** Alias — same as {@link createEwayHostedPayment}. */
export const createEwayPayment = createEwayHostedPayment;

function extractInvoiceReferenceFromEwayJson(
  json: Record<string, unknown>,
  txRaw?: Record<string, unknown>
): string | undefined {
  const fromPayment = (p: unknown): string | undefined => {
    if (p == null || typeof p !== "object") return undefined;
    const ref = (p as Record<string, unknown>).InvoiceReference;
    return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
  };
  const top = json.InvoiceReference;
  if (typeof top === "string" && top.trim()) return top.trim();
  const payRoot = fromPayment(json.Payment);
  if (payRoot) return payRoot;
  if (txRaw) {
    const tr = txRaw.InvoiceReference;
    if (typeof tr === "string" && tr.trim()) return tr.trim();
    const tp = fromPayment(txRaw.Payment);
    if (tp) return tp;
  }
  return undefined;
}

export type EwayVerifyResult =
  | {
      ok: true;
      success: boolean;
      transactionId?: string;
      responseCode?: string;
      invoiceReference?: string;
    }
  | { ok: false; error: string };

export async function verifyEwayPayment(accessCode: string): Promise<EwayVerifyResult> {
  const apiKey = process.env.EWAY_API_KEY?.trim();
  const apiPassword = process.env.EWAY_PASSWORD?.trim();
  if (!apiKey || !apiPassword) {
    return { ok: false, error: "eWAY API credentials are not configured." };
  }
  const code = String(accessCode || "").trim();
  if (!code) {
    return { ok: false, error: "AccessCode is required." };
  }

  const auth = Buffer.from(`${apiKey}:${apiPassword}`).toString("base64");
  const endpoint = `${ewayApiRoot()}/AccessCode/${encodeURIComponent(code)}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "eWAY verify request failed";
    return { ok: false, error: msg };
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON from eWAY verify response." };
  }

  if (!res.ok) {
    const err = typeof json.Errors === "string" ? json.Errors : `eWAY verify HTTP ${res.status}`;
    console.warn("[eway] verify HTTP", res.status, err);
    return { ok: false, error: String(err) };
  }

  const txRaw: Record<string, unknown> | undefined = (() => {
    if (Array.isArray(json.Transactions) && json.Transactions.length > 0) {
      return json.Transactions[0] as Record<string, unknown>;
    }
    if (json.Transaction && typeof json.Transaction === "object") {
      return json.Transaction as Record<string, unknown>;
    }
    if ("TransactionStatus" in json || "TransactionID" in json || "ResponseCode" in json) {
      return json;
    }
    return undefined;
  })();

  const parseTransactionStatus = (v: unknown): boolean => {
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      return s === "true" || s === "1";
    }
    if (typeof v === "number" && Number.isFinite(v)) return v === 1;
    return false;
  };

  const normalizeResponseCode = (v: unknown): string | undefined => {
    if (v == null || v === "") return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    return /^\d+$/.test(s) ? s.padStart(2, "0") : s;
  };

  const txStatus = parseTransactionStatus(txRaw?.TransactionStatus);
  const responseCode = normalizeResponseCode(txRaw?.ResponseCode);
  const transactionId = txRaw?.TransactionID ? String(txRaw.TransactionID) : undefined;

  const approved = responseCode === undefined ? txStatus : responseCode === "00";

  const invoiceReference = extractInvoiceReferenceFromEwayJson(json, txRaw);

  console.log("[eway] verify AccessCode result", {
    transactionStatus: txStatus,
    responseCode: responseCode ?? null,
    approved,
    hasInvoiceRef: Boolean(invoiceReference),
  });

  return {
    ok: true,
    success: txStatus && approved,
    transactionId,
    responseCode,
    ...(invoiceReference ? { invoiceReference } : {}),
  };
}

/** @deprecated use verifyEwayPayment */
export const verifyEwayAccessCode = verifyEwayPayment;
