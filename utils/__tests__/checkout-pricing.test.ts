import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";

jest.mock("@/lib/cart-sync", () => ({
  syncCartToWooCommerce: jest.fn(),
}));

const { syncCartToWooCommerce } = jest.requireMock("@/lib/cart-sync") as {
  syncCartToWooCommerce: jest.Mock;
};

describe("validateAndRecalculateCheckout", () => {
  beforeEach(() => {
    syncCartToWooCommerce.mockReset();
    (global as any).fetch = jest.fn();
  });

  it("fails when Woo validation drops requested items (stale cart)", async () => {
    syncCartToWooCommerce.mockResolvedValue({
      items: [
        {
          id: "1",
          product_id: 111,
          variation_id: undefined,
          quantity: 1,
          name: "Valid",
          price: "10.00",
        },
      ],
      subtotal: "10",
      total: "10",
      tax_total: "0",
      shipping_total: "0",
      discount_total: "0",
    });

    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        rates: [{ id: "flat_rate:1", label: "Flat", cost: 0 }],
      }),
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
          { product_id: 222, quantity: 1 }, // dropped by Woo -> should fail
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

