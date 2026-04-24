import {
  buildNdisInfoJsonFromForm,
  countNdisDigitsInCheckoutPayload,
  flatHcpOrderMetaRowsFromHcpInfoJson,
  flatNdisOrderMetaRowsFromNdisInfoJson,
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
 
  it("flatNdisOrderMetaRowsFromNdisInfoJson emits flat Woo keys for integrations", () => {
    const j = JSON.stringify({
      number: "430123456",
      participant_name: "Rachel Laws",
      dob: "1990-01-01",
      funding_type: "plan_managed",
      invoice_email: "x@example.com",
      approval: true,
    });
    const rows = flatNdisOrderMetaRowsFromNdisInfoJson(j, undefined);
    expect(rows.some((r) => r.key === "ndis_customer" && r.value === "yes")).toBe(true);
    expect(rows.some((r) => r.key === "ndis_number" && r.value === "430123456")).toBe(true);
    expect(rows.some((r) => r.key === "cust_woo_ndis_number" && r.value === "430123456")).toBe(true);
    expect(rows.some((r) => r.key === "ndis_participant_name" && r.value === "Rachel Laws")).toBe(
      true,
    );
    expect(
      rows.some((r) => r.key === "cust_woo_ndis_participant_name" && r.value === "Rachel Laws"),
    ).toBe(true);
    expect(rows.some((r) => r.key === "cust_woo_invoice_email" && r.value === "x@example.com")).toBe(
      true,
    );
    expect(rows.some((r) => r.key === "ndis_approval" && r.value === "yes")).toBe(true);
    expect(rows.some((r) => r.key === "cust_woo_ndis_approval" && r.value === "yes")).toBe(true);
  });
 
  it("flatNdisOrderMetaRowsFromNdisInfoJson uses ndis_type fallback when JSON omits funding_type", () => {
    const j = JSON.stringify({ number: "430123456" });
    const rows = flatNdisOrderMetaRowsFromNdisInfoJson(j, "Plan-managed funding");
    expect(rows.some((r) => r.key === "ndis_funding_type" && r.value === "Plan-managed funding")).toBe(
      true,
    );
    expect(
      rows.some((r) => r.key === "cust_woo_ndis_funding_type" && r.value === "Plan-managed funding"),
    ).toBe(true);
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