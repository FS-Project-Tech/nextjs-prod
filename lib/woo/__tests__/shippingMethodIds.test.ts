import { splitWooZoneShippingMethodId } from "@/lib/woo/shippingMethodIds";

describe("splitWooZoneShippingMethodId", () => {
  it("splits composite zone method id", () => {
    expect(splitWooZoneShippingMethodId("flat_rate:12")).toEqual({
      method_id: "flat_rate",
      instance_id: "12",
    });
  });

  it("returns method_id only when no colon", () => {
    expect(splitWooZoneShippingMethodId("local_pickup")).toEqual({
      method_id: "local_pickup",
    });
  });

  it("trims whitespace", () => {
    expect(splitWooZoneShippingMethodId("  free_shipping:3  ")).toEqual({
      method_id: "free_shipping",
      instance_id: "3",
    });
  });
});
