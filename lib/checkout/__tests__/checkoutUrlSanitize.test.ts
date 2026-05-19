import { describe, expect, it } from "vitest";
import {
  CHECKOUT_TRANSIENT_QUERY_PARAMS,
  checkoutUrlHasTransientQueryParams,
} from "../checkoutUrlSanitize";

describe("checkoutUrlSanitize", () => {
  it("detects eWAY AccessCode variants", () => {
    expect(checkoutUrlHasTransientQueryParams(new URLSearchParams("AccessCode=abc"))).toBe(true);
    expect(checkoutUrlHasTransientQueryParams(new URLSearchParams("accessCode=abc"))).toBe(true);
    expect(checkoutUrlHasTransientQueryParams(new URLSearchParams("quote=1"))).toBe(false);
  });

  it("includes cancelled and error keys", () => {
    expect(CHECKOUT_TRANSIENT_QUERY_PARAMS).toContain("cancelled");
    expect(CHECKOUT_TRANSIENT_QUERY_PARAMS).toContain("error");
    expect(CHECKOUT_TRANSIENT_QUERY_PARAMS).toContain("AccessCode");
  });
});
