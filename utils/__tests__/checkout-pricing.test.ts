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

jest.mock("@/lib/woo/stockCheck", () => ({
  assertCheckoutLineItemsStock: jest.fn().mockResolvedValue(undefined),
  CheckoutStockError: class CheckoutStockError extends Error {},
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
      rates: [
        {
          id: "flat_rate:1",
          method_id: "flat_rate",
          label: "Flat",
          cost: 0,
          zoneId: 1,
          zone: "AU",
        },
      ],
    });
    wcGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === "/coupons") {
        return Promise.resolve({ data: [] });
      }
      if (path === "/products" && params && "include" in params) {
        const inc = String(params.include || "");
        const id = Number(inc.split(",")[0]?.trim() || "0");
        return Promise.resolve({
          data: [
            {
              id,
              price: id === 5 ? "12.50" : "10.00",
              tax_class: id === 5 ? "" : "gst-free",
              tax_status: id === 5 ? "taxable" : "none",
            },
          ],
        });
      }
      if (path === "/products/5") {
        return Promise.resolve({
          data: { price: "10.00", tax_class: "gst-free", tax_status: "none" },
        });
      }
      return Promise.resolve({ data: path === "/products" ? [] : {} });
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

  it("sets Woo line subtotal/total from REST unit price × qty", async () => {
    resolveWooLineItems.mockResolvedValue({
      ok: true,
      line_items: [{ product_id: 5, quantity: 3 }],
    });

    const r = await validateAndRecalculateCheckout({
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
      line_items: [{ product_id: 5, quantity: 3 }],
      shipping_method_id: "flat_rate:1",
      payment_method: "eway",
      insurance_option: "no",
    });

    expect(r.wooLineItems).toHaveLength(1);
    expect(r.wooLineItems[0].subtotal).toBe("37.50");
    expect(r.wooLineItems[0].total).toBe("37.50");
    expect(r.shippingLine.method_id).toBe("flat_rate");
    expect(r.shippingLine.instance_id).toBe("1");
  });

  it("uses client unit_price over Woo REST when provided (PDP multipliers)", async () => {
    resolveWooLineItems.mockResolvedValue({
      ok: true,
      line_items: [{ product_id: 5, quantity: 2 }],
    });

    const r = await validateAndRecalculateCheckout({
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
      line_items: [{ product_id: 5, quantity: 2, unit_price: 148.6 }],
      shipping_method_id: "flat_rate:1",
      payment_method: "eway",
      insurance_option: "no",
    });

    expect(r.totals.subtotal).toBeCloseTo(297.2, 5);
    expect(r.wooLineItems[0].subtotal).toBe("297.20");
    expect(r.wooLineItems[0].total).toBe("297.20");
  });
});
