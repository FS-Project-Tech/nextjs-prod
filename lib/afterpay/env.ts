import "server-only";

export function afterpayPublicKey(): string {
  return (
    process.env.AFTERPAY_MERCHANT_ID?.trim() ||
    process.env.AFTERPAY_PUBLIC_KEY?.trim() ||
    ""
  );
}

export function afterpayConfigured(): boolean {
  return Boolean(afterpayPublicKey() && process.env.AFTERPAY_SECRET_KEY?.trim() && afterpayApiBase());
}

export function afterpayPublicActionsEnabled(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_AFTERPAY_ENABLED !== "undefined" &&
    String(process.env.NEXT_PUBLIC_AFTERPAY_ENABLED).toLowerCase() === "true"
  );
}

export function afterpaySiteUrl(): string {
  const u =
    process.env.AFTERPAY_REDIRECT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    "";
  if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, "");
  if (u) return `https://${u.replace(/\/$/, "")}`;
  return "";
}

export function afterpayApiBase(): string {
  const explicit = process.env.AFTERPAY_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const sandbox = String(process.env.AFTERPAY_SANDBOX || "").toLowerCase() === "true";
  return sandbox ? "https://global-api-sandbox.afterpay.com" : "https://global-api.afterpay.com";
}
