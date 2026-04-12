import {
  buildNdisInfoJsonFromForm,
  countNdisDigitsInCheckoutPayload,
  flatHcpOrderMetaRowsFromHcpInfoJson,
  hcpDisplayFromOrderMeta,
  stripEmptyNdisHcpFromInitiatePayload,
} from "@/lib/checkout/ndisHcpPayload";
import type { CheckoutInitiatePayload } from "@/types/checkout";

describe("ndisHcpPayload", () => {
  it("buildNdisInfoJsonFromForm returns undefined when nothing substantive is filled", () => {
    expect(
      buildNdisInfoJsonFromForm({
        cust_woo_ndis_approval: true,
      }),
    ).toBeUndefined();
  });

  it("buildNdisInfoJsonFromForm includes JSON when NDIS number has digits", () => {
    const j = buildNdisInfoJsonFromForm({ cust_woo_ndis_number: "430 123 456" });
    expect(j).toBeTruthy();
    const p = JSON.parse(j!);
    expect(p.number).toBe("430 123 456");
  });

  it("countNdisDigitsInCheckoutPayload counts digits in ndis_info JSON", () => {
    const payload = {
      ndis_info: JSON.stringify({ number: "430-123-456" }),
    } as CheckoutInitiatePayload;
    expect(countNdisDigitsInCheckoutPayload(payload)).toBe(9);
  });

  it("flatHcpOrderMetaRowsFromHcpInfoJson emits flat Woo keys", () => {
    const j = JSON.stringify({
      participant_name: "Jane",
      number: "HCP-1",
      provider_email: "pay@provider.com",
      approval: true,
    });
    const rows = flatHcpOrderMetaRowsFromHcpInfoJson(j);
    expect(rows.some((r) => r.key === "hcp_participant_name" && r.value === "Jane")).toBe(true);
    expect(rows.some((r) => r.key === "hcp_number" && r.value === "HCP-1")).toBe(true);
    expect(rows.some((r) => r.key === "hcp_provider_email")).toBe(true);
    expect(rows.some((r) => r.key === "hcp_approval" && r.value === "yes")).toBe(true);
  });

  it("hcpDisplayFromOrderMeta reads flat meta when hcp_info missing", () => {
    const d = hcpDisplayFromOrderMeta([
      { key: "hcp_participant_name", value: "Bob" },
      { key: "hcp_number", value: "99" },
    ]);
    expect(d?.participantName).toBe("Bob");
    expect(d?.number).toBe("99");
  });

  it("stripEmptyNdisHcpFromInitiatePayload drops empty ndis_info", () => {
    const p = {
      billing: {} as CheckoutInitiatePayload["billing"],
      shipping: {} as CheckoutInitiatePayload["shipping"],
      line_items: [],
      shipping_method_id: "x",
      payment_method: "eway" as const,
      ndis_info: "{}",
    } as unknown as CheckoutInitiatePayload;
    const out = stripEmptyNdisHcpFromInitiatePayload(p);
    expect(out.ndis_info).toBeUndefined();
  });
});
