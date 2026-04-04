type Level = "info" | "warn" | "error";

export function logCheckoutSession(
  level: Level,
  event: string,
  detail?: Record<string, unknown>
): void {
  const payload = { event, ...detail, ts: new Date().toISOString() };
  if (level === "error") {
    console.error("[checkout-session]", payload);
  } else if (level === "warn") {
    console.warn("[checkout-session]", payload);
  } else {
    if (process.env.NODE_ENV === "development") {
      console.info("[checkout-session]", payload);
    }
  }
}
