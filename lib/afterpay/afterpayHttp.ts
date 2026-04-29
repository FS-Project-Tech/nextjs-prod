import "server-only";

import { afterpayApiBase } from "@/lib/afterpay/env";

function basicAuthHeader(): string {
  const user = process.env.AFTERPAY_PUBLIC_KEY!.trim();
  const pass = process.env.AFTERPAY_SECRET_KEY!.trim();
  const raw = `${user}:${pass}`;
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(raw);
  return `Basic ${b64}`;
}

export type Money = { amount: string; currency: string };

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
    const msg =
      typeof json.message === "string"
        ? json.message
        : typeof json.errorCode === "string"
          ? json.errorCode
          : `HTTP ${res.status}`;
    throw new Error(`Afterpay checkout failed: ${msg}`);
  }
  return json as {
    token?: string;
    expires?: string;
    redirectCheckoutUrl?: string;
  };
}

export async function afterpayGetPayment(token: string): Promise<Record<string, unknown>> {
  const url = `${afterpayApiBase()}/v2/payments/${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
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
    const msg = typeof json.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new Error(`Afterpay payment lookup failed: ${msg}`);
  }
  return json;
}

export async function afterpayCapturePayment(token: string): Promise<Record<string, unknown>> {
  const url = `${afterpayApiBase()}/v2/payments/${encodeURIComponent(token)}/capture`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
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
    const msg =
      typeof json.message === "string"
        ? json.message
        : typeof json.errorCode === "string"
          ? json.errorCode
          : `HTTP ${res.status}`;
    throw new Error(`Afterpay capture failed: ${msg}`);
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
