import type { QuoteRequestPayload } from "@/lib/types/quote";
import type { PriceMatchRequestBody } from "./types";

function formatAttributesForNotes(attrs?: Record<string, string>): string {
  if (!attrs || !Object.keys(attrs).length) return "";
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function buildPriceMatchNotes(body: PriceMatchRequestBody): string {
  const lines: string[] = ["--- Price Match Request ---", ""];
  lines.push(`Current price: ${body.product.currentPriceLabel}`);
  lines.push(
    `Ask price: ${body.askPrice}${body.priceIncludesGst ? " (customer indicated price includes GST)" : " (excl. GST)"}`,
  );

  const attrs = formatAttributesForNotes(body.product.attributes);
  if (attrs) {
    lines.push("");
    lines.push("Product options:");
    lines.push(attrs);
  }

  lines.push("");
  if (body.evidenceMode === "link" && body.competitorLink?.trim()) {
    lines.push(`Competitor link: ${body.competitorLink.trim()}`);
  } else if (body.evidenceMode === "file" && body.evidenceFile) {
    lines.push(`Evidence: Attached file — ${body.evidenceFile.name}`);
  } else if (body.evidenceMode === "photo" && body.evidenceFile) {
    lines.push(`Evidence: Attached photo — ${body.evidenceFile.name}`);
  }

  if (body.notes?.trim()) {
    lines.push("");
    lines.push("Customer notes:");
    lines.push(body.notes.trim());
  }

  return lines.join("\n");
}

export function buildQuotePayloadFromPriceMatch(
  body: PriceMatchRequestBody,
): QuoteRequestPayload {
  const askNum = parseFloat(String(body.askPrice).replace(/[^0-9.]/g, "")) || 0;
  const currentNum = parseFloat(String(body.product.price).replace(/[^0-9.]/g, "")) || 0;

  return {
    email: body.email,
    userName: body.userName,
    items: [
      {
        name: body.product.name,
        sku: body.product.sku || null,
        price: body.product.price,
        qty: 1,
        product_id: body.product.productId,
        variation_id: body.product.variationId,
        attributes: body.product.attributes || {},
      },
    ],
    subtotal: currentNum,
    shipping: 0,
    shippingMethod: "",
    discount: 0,
    total: askNum,
    notes: buildPriceMatchNotes(body),
    billing_address: {
      first_name: body.userName.split(/\s+/)[0] || body.userName,
      last_name: body.userName.split(/\s+/).slice(1).join(" ") || "",
      email: body.email,
      phone: body.phone,
    },
    shipping_address: null,
    ndis_info: null,
  };
}
