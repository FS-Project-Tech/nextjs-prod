import "server-only";

export function afterpayConfigured(): boolean {
  return Boolean(
    process.env.AFTERPAY_PUBLIC_KEY?.trim() &&
      process.env.AFTERPAY_SECRET_KEY?.trim() &&
      process.env.AFTERPAY_BASE_URL?.trim(),
  );
}

export function afterpayPublicActionsEnabled(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_AFTERPAY_ENABLED !== "undefined" &&
    String(process.env.NEXT_PUBLIC_AFTERPAY_ENABLED).toLowerCase() === "true"
  );
}

export function afterpaySiteUrl(): string {
  const u =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    "";
  if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, "");
  if (u) return `https://${u.replace(/\/$/, "")}`;
  return "";
}

export function afterpayApiBase(): string {
  return process.env.AFTERPAY_BASE_URL!.replace(/\/$/, "");
}
