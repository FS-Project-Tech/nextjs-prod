import "server-only";

import { afterpayApiBase, afterpayPublicKey } from "@/lib/afterpay/env";

const AFTERPAY_USER_AGENT = "JoyaMedicalHeadlessCheckout/1.0";

function basicAuthHeader(): string {
  const user = afterpayPublicKey();
  const pass = process.env.AFTERPAY_SECRET_KEY!.trim();
  const raw = `${user}:${pass}`;
  const b64 =
    typeof Buffer !== "undefined" ? Buffer.from(raw, "utf8").toString("base64") : btoa(raw);
  return `Basic ${b64}`;
}

export type Money = { amount: string; currency: string };

export class AfterpayApiError extends Error {
  readonly httpStatus: number;
  readonly errorCode: string;
  readonly publicMessage: string;
  readonly responseBody: Record<string, unknown>;

  constructor(params: {
    operation: string;
    httpStatus: number;
    responseBody: Record<string, unknown>;
  }) {
    const errorCode =
      typeof params.responseBody.errorCode === "string" ? params.responseBody.errorCode : "";
    const upstreamMessage =
      typeof params.responseBody.message === "string"
        ? params.responseBody.message
        : errorCode || `HTTP ${params.httpStatus}`;
    super(`Afterpay ${params.operation} failed: ${upstreamMessage}`);
    this.name = "AfterpayApiError";
    this.httpStatus = params.httpStatus;
    this.errorCode = errorCode;
    this.responseBody = params.responseBody;
    this.publicMessage = publicAfterpayMessage(errorCode, upstreamMessage);
  }
}

export function isAfterpayApiError(error: unknown): error is AfterpayApiError {
  return error instanceof AfterpayApiError;
}

function publicAfterpayMessage(errorCode: string, message: string): string {
  const code = errorCode.toLowerCase();
  const msg = message.toLowerCase();
  if (code === "unsupported_payment_type" || msg.includes("payment type not supported")) {
    return "Afterpay is not available for this order amount. Please choose card payment or update your cart total.";
  }
  if (code === "unsupported_currency") {
    return "Afterpay is not available for this currency. Please choose another payment method.";
  }
  if (code === "invalid_object" || msg.includes("amount")) {
    return "Afterpay could not accept this checkout total. Please choose another payment method.";
  }
  return message || "Afterpay could not start. Please choose another payment method.";
}

export async function afterpayCreateCheckout(body: Record<string, unknown>): Promise<{
  token?: string;
  expires?: string;
  redirectCheckoutUrl?: string;
}> {
  const url = `${afterpayApiBase()}/v2/checkouts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": AFTERPAY_USER_AGENT,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Afterpay checkout create returned non-JSON (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new AfterpayApiError({
      operation: "checkout",
      httpStatus: res.status,
      responseBody: json,
    });
  }
  return json as {
    token?: string;
    expires?: string;
    redirectCheckoutUrl?: string;
  };
}

export async function afterpayGetPayment(token: string): Promise<Record<string, unknown>> {
  const url = `${afterpayApiBase()}/v2/payments/token:${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
      "User-Agent": AFTERPAY_USER_AGENT,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Afterpay payment lookup returned non-JSON (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new AfterpayApiError({
      operation: "payment lookup",
      httpStatus: res.status,
      responseBody: json,
    });
  }
  return json;
}

export async function afterpayCapturePayment(
  token: string,
  params?: {
    merchantReference?: string;
    amount?: Money;
  }
): Promise<Record<string, unknown>> {
  const url = `${afterpayApiBase()}/v2/payments/capture`;
  const body = {
    token,
    ...(params?.merchantReference ? { merchantReference: params.merchantReference } : {}),
    ...(params?.amount ? { amount: params.amount } : {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": AFTERPAY_USER_AGENT,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Afterpay capture returned non-JSON (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new AfterpayApiError({
      operation: "capture",
      httpStatus: res.status,
      responseBody: json,
    });
  }
  return json;
}

/** Compare Money objects to validated checkout total (AUD). */
export function moneyMatchesTotal(m: unknown, expectedTotal: number, currency = "AUD"): boolean {
  if (!m || typeof m !== "object") return false;
  const obj = m as Money;
  const amt = Number.parseFloat(String(obj.amount ?? "").replace(",", ""));
  const cur = String(obj.currency ?? "").toUpperCase();
  if (!Number.isFinite(amt) || cur !== currency.toUpperCase()) return false;
  return Math.abs(amt - expectedTotal) < 0.02;
}
