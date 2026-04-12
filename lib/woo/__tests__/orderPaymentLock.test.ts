import {
  HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY,
  HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import {
  mergeEwayPaymentSessionMeta,
  shouldReuseEwayPayment,
} from "@/lib/woo/orderPaymentLock";

describe("orderPaymentLock", () => {
  it("reuses only when stored session total matches current order total", () => {
    const order = {
      total: "60.50",
      meta_data: [
        { key: "payment_initiated", value: "true" },
        { key: "payment_url", value: "https://eway.example/pay" },
        { key: HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY, value: "60.50" },
      ],
    };
    expect(shouldReuseEwayPayment(order)).toBe(true);
  });

  it("does not reuse when order total changed", () => {
    const order = {
      total: "60.50",
      meta_data: [
        { key: "payment_initiated", value: "true" },
        { key: "payment_url", value: "https://eway.example/pay" },
        { key: HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY, value: "18.37" },
      ],
    };
    expect(shouldReuseEwayPayment(order)).toBe(false);
  });

  it("reuses when validated checkout meta matches stored session even if Woo order.total drifts", () => {
    const order = {
      total: "10.00",
      meta_data: [
        { key: "payment_initiated", value: "true" },
        { key: "payment_url", value: "https://eway.example/pay" },
        { key: HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY, value: "60.50" },
        { key: HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY, value: "60.50" },
      ],
    };
    expect(shouldReuseEwayPayment(order)).toBe(true);
  });

  it("does not reuse when session total meta missing (legacy)", () => {
    const order = {
      total: "60.50",
      meta_data: [
        { key: "payment_initiated", value: "true" },
        { key: "payment_url", value: "https://eway.example/pay" },
      ],
    };
    expect(shouldReuseEwayPayment(order)).toBe(false);
  });

  it("mergeEwayPaymentSessionMeta writes order total key", () => {
    const rows = mergeEwayPaymentSessionMeta({}, "https://pay.example", "12.34");
    expect(rows.some((r) => r.key === "headless_eway_order_total" && r.value === "12.34")).toBe(
      true,
    );
  });
});
