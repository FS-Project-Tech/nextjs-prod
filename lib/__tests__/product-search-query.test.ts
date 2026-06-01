import {
  buildProductSearchQueryPlan,
  normalizeProductSearchQuery,
  tokenizeProductSearchQuery,
} from "@/lib/product-search-query";

describe("product-search-query", () => {
  it("normalizes punctuation and whitespace without changing the user intent", () => {
    expect(normalizeProductSearchQuery("  3in\u20111   Wet  ")).toBe("3in-1 Wet");
  });

  it("expands 3-in-1 style phrases for relaxed product search", () => {
    const plan = buildProductSearchQueryPlan("3in 1 wet");

    expect(plan.strictQuery).toBe("3in 1 wet");
    expect(plan.relaxedParts).toEqual(
      expect.arrayContaining(["3 in 1 wet", "3-in-1 wet", "3in1 wet", "3in", "1", "wet"])
    );
    expect(plan.relaxedQuery).toContain(" || ");
  });

  it("expands common unit spacing variants", () => {
    const plan = buildProductSearchQueryPlan("1000ml bag");

    expect(plan.relaxedParts).toEqual(expect.arrayContaining(["1000 ml bag", "1000ml", "bag"]));
  });

  it("keeps useful numeric tokens and removes common filler words", () => {
    expect(tokenizeProductSearchQuery("pack of 25 with 1000ml")).toEqual(["pack", "25", "1000ml"]);
  });
});
