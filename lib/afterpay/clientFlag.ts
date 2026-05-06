/** Client-safe: enable Afterpay option when `NEXT_PUBLIC_AFTERPAY_ENABLED=true`. */

export function isAfterpayCheckoutUiEnabled(): boolean {
  try {
    return (
      typeof process.env.NEXT_PUBLIC_AFTERPAY_ENABLED !== "undefined" &&
      String(process.env.NEXT_PUBLIC_AFTERPAY_ENABLED).toLowerCase() === "true"
    );
  } catch {
    return false;
  }
}
