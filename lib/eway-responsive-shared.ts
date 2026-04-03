/**
 * eWAY Rapid API — Responsive Shared Page (AccessCodesShared).
 * @see https://eway.io/api-v3/
 */

function ewayApiRoot(): string {
  const sandbox =
    process.env.EWAY_SANDBOX === "true" || process.env.EWAY_API_ENV === "sandbox";
  return sandbox
    ? "https://api.sandbox.ewaypayments.com"
    : "https://api.ewaypayments.com";
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
  const c = String(iso || "AU").trim().toLowerCase();
  if (c === "australia") return "au";
  return c.length === 2 ? c : "au";
}

export function isEwayRapidConfigured(): boolean {
  return Boolean(
    process.env.EWAY_API_KEY?.trim() && process.env.EWAY_PASSWORD?.trim()
  );
}

export type EwaySharedPaymentInput = {
  wooOrderId: string | number;
  /** Woo order total as returned by REST, e.g. "123.45" — must match the order. */
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

function formatEwayErrors(errors: unknown): string {
  if (errors == null) return "Unknown eWAY error";
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.map(String).join("; ");
  if (typeof errors === "object") return JSON.stringify(errors);
  return String(errors);
}

export async function createEwaySharedPaymentUrl(
  input: EwaySharedPaymentInput
): Promise<
  | { ok: true; sharedPaymentUrl: string; accessCode: string }
  | { ok: false; error: string }
> {
  const apiKey = process.env.EWAY_API_KEY?.trim();
  const apiPassword = process.env.EWAY_PASSWORD?.trim();
  if (!apiKey || !apiPassword) {
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

  const oid = encodeURIComponent(String(input.wooOrderId));
  const redirectUrl = `${base}/order-review?order_id=${oid}`;
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
      InvoiceNumber: String(input.wooOrderId).slice(0, 64),
      InvoiceDescription: "Order payment",
      InvoiceReference: String(input.wooOrderId).slice(0, 50),
      CurrencyCode: (input.currencyCode || "AUD").toUpperCase(),
    },
    RedirectUrl: redirectUrl,
    CancelUrl: cancelUrl,
    TransactionType: "Purchase",
    Method: "ProcessPayment",
    ...(input.customerIp ? { CustomerIP: input.customerIp } : {}),
  };

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
    errField != null &&
    errField !== "" &&
    !(Array.isArray(errField) && errField.length === 0);
  if (hasErrors) {
    return { ok: false, error: formatEwayErrors(errField) };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: formatEwayErrors(json.Errors ?? json) || `eWAY HTTP ${res.status}`,
    };
  }

  const url = json.SharedPaymentUrl;
  const accessCode = json.AccessCode;
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: "eWAY did not return SharedPaymentUrl." };
  }

  return {
    ok: true,
    sharedPaymentUrl: url.trim(),
    accessCode: typeof accessCode === "string" ? accessCode : "",
  };
}

export async function verifyEwayAccessCode(
  accessCode: string
): Promise<
  | { ok: true; success: boolean; transactionId?: string; responseCode?: string }
  | { ok: false; error: string }
> {
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
    const err =
      typeof json.Errors === "string"
        ? json.Errors
        : `eWAY verify HTTP ${res.status}`;
    return { ok: false, error: String(err) };
  }

  /**
   * GetAccessCodeResult (GET /AccessCode/{code}) returns TransactionStatus,
   * ResponseCode, and TransactionID at the **root** of the JSON. Some flows
   * nest the same fields under Transactions[0] or Transaction instead.
   */
  const txRaw: Record<string, unknown> | undefined = (() => {
    if (Array.isArray(json.Transactions) && json.Transactions.length > 0) {
      return json.Transactions[0] as Record<string, unknown>;
    }
    if (json.Transaction && typeof json.Transaction === "object") {
      return json.Transaction as Record<string, unknown>;
    }
    if (
      "TransactionStatus" in json ||
      "TransactionID" in json ||
      "ResponseCode" in json
    ) {
      return json;
    }
    return undefined;
  })();

  const parseEwayTransactionStatus = (v: unknown): boolean => {
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

  const txStatus = parseEwayTransactionStatus(txRaw?.TransactionStatus);
  const responseCode = normalizeResponseCode(txRaw?.ResponseCode);
  const transactionId = txRaw?.TransactionID
    ? String(txRaw.TransactionID)
    : undefined;

  const approved =
    responseCode === undefined ? txStatus : responseCode === "00";

  return {
    ok: true,
    success: txStatus && approved,
    transactionId,
    responseCode,
  };
}
