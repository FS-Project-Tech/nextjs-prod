import {
  isExactSkuSearchQuery,
  isSingleSkuAutocompleteQuery,
  parseSkuTokens,
} from "@/lib/sku-search-tokens";

describe("sku-search-tokens", () => {
  it("keeps natural product phrases with digits in keyword search", () => {
    const query = "3in 1 wet";
    const tokens = parseSkuTokens(query);

    expect(tokens).toEqual(["3in 1 wet"]);
    expect(isExactSkuSearchQuery(query, tokens)).toBe(false);
    expect(isSingleSkuAutocompleteQuery(query, tokens)).toBe(false);
  });

  it("treats single compact numeric or separated SKU queries as autocomplete searches", () => {
    expect(isExactSkuSearchQuery("995096")).toBe(false);
    expect(isSingleSkuAutocompleteQuery("995096")).toBe(true);
    expect(isExactSkuSearchQuery("995096-OLD")).toBe(false);
    expect(isSingleSkuAutocompleteQuery("995096-OLD")).toBe(true);
    expect(isExactSkuSearchQuery("57-885")).toBe(false);
    expect(isSingleSkuAutocompleteQuery("57-885")).toBe(true);
  });

  it("keeps comma-separated SKU lists as exact SKU searches", () => {
    const query = "995096-OLD, 995097";
    const tokens = parseSkuTokens(query);

    expect(tokens).toEqual(["995096-OLD", "995097"]);
    expect(isExactSkuSearchQuery(query, tokens)).toBe(true);
  });
});
