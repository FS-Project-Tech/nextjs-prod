import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";

jest.mock("@/lib/woo/resolveLineItems", () => ({
  resolveWooLineItems: jest.fn(),
}));

jest.mock("@/lib/shipping-rates-server", () => ({
  computeShippingRates: jest.fn(),
}));

jest.mock("@/lib/woocommerce/wc-fetch", () => ({
  wcGet: jest.fn(),
}));

const { resolveWooLineItems } = jest.requireMock("@/lib/woo/resolveLineItems") as {
  resolveWooLineItems: jest.Mock;
};

const { computeShippingRates } = jest.requireMock("@/lib/shipping-rates-server") as {
  computeShippingRates: jest.Mock;
};

const { wcGet } = jest.requireMock("@/lib/woocommerce/wc-fetch") as { wcGet: jest.Mock };

describe("validateAndRecalculateCheckout", () => {
  beforeEach(() => {
    resolveWooLineItems.mockReset();
    computeShippingRates.mockReset();
    wcGet.mockReset();
    computeShippingRates.mockResolvedValue({
      rates: [{ id: "flat_rate:1", label: "Flat", cost: 0 }],
    });
  });

  it("fails when Woo validation drops requested items (stale cart)", async () => {
    resolveWooLineItems.mockResolvedValue({
      ok: false,
      unavailableItems: [
        {
          product_id: 222,
          variation_id: null,
          reason: "not found",
        },
      ],
    });

    await expect(
      validateAndRecalculateCheckout({
        billing: {
          first_name: "A",
          last_name: "B",
          email: "a@example.com",
          phone: "0400000000",
          company: "",
          address_1: "1 Test St",
          address_2: "",
          city: "Gold Coast",
          state: "QLD",
          postcode: "4209",
          country: "AU",
        },
        shipping: {
          first_name: "A",
          last_name: "B",
          email: "a@example.com",
          phone: "0400000000",
          company: "",
          address_1: "1 Test St",
          address_2: "",
          city: "Gold Coast",
          state: "QLD",
          postcode: "4209",
          country: "AU",
        },
        line_items: [
          { product_id: 111, quantity: 1 },
          { product_id: 222, quantity: 1 },
        ],
        shipping_method_id: "flat_rate:1",
        payment_method: "eway",
        coupon_code: undefined,
        insurance_option: "no",
        ndis_type: undefined,
      })
    ).rejects.toThrow(/no longer available/i);
  });
});
