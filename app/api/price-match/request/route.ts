import { NextRequest, NextResponse } from "next/server";
import { storeQuote } from "@/lib/quote-storage";
import { sendQuoteCreatedEmail } from "@/lib/quote-email";
import { buildQuotePayloadFromPriceMatch } from "@/lib/price-match/buildPriceMatchPayload";
import { generatePriceMatchNumber } from "@/lib/price-match/generatePriceMatchNumber";
import type { PriceMatchRequestBody } from "@/lib/price-match/types";

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

function parseBody(raw: unknown): PriceMatchRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const product = b.product;
  if (!product || typeof product !== "object") return null;
  const p = product as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim() : "";
  const userName = typeof b.userName === "string" ? b.userName.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!email || !userName) return null;

  const evidenceMode = b.evidenceMode;
  if (evidenceMode !== "link" && evidenceMode !== "file" && evidenceMode !== "photo") {
    return null;
  }

  let evidenceFile: PriceMatchRequestBody["evidenceFile"];
  if (b.evidenceFile && typeof b.evidenceFile === "object") {
    const f = b.evidenceFile as Record<string, unknown>;
    const name = typeof f.name === "string" ? f.name : "";
    const mime = typeof f.mime === "string" ? f.mime : "application/octet-stream";
    const base64 = typeof f.base64 === "string" ? f.base64 : "";
    if (name && base64) {
      const sizeBytes = Math.ceil((base64.length * 3) / 4);
      if (sizeBytes > MAX_EVIDENCE_BYTES) {
        return null;
      }
      evidenceFile = { name, mime, base64 };
    }
  }

  return {
    email,
    userName,
    phone,
    product: {
      productId: Number(p.productId) || 0,
      variationId: p.variationId != null ? Number(p.variationId) : undefined,
      name: String(p.name || "Product"),
      sku: typeof p.sku === "string" ? p.sku : undefined,
      imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : undefined,
      price: String(p.price || "0"),
      currentPriceLabel: String(p.currentPriceLabel || p.price || "0"),
      attributes:
        p.attributes && typeof p.attributes === "object"
          ? (p.attributes as Record<string, string>)
          : undefined,
      tax_class: typeof p.tax_class === "string" ? p.tax_class : null,
      tax_status: typeof p.tax_status === "string" ? p.tax_status : null,
    },
    askPrice: String(b.askPrice || "").trim(),
    priceIncludesGst: Boolean(b.priceIncludesGst),
    evidenceMode,
    competitorLink: typeof b.competitorLink === "string" ? b.competitorLink.trim() : undefined,
    evidenceFile,
    notes: typeof b.notes === "string" ? b.notes.trim() : undefined,
  };
}

/**
 * POST /api/price-match/request
 * Submits a price match request using the same quote email + storage pipeline.
 */
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json());
    if (!body) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (body.evidenceMode === "link" && !body.competitorLink?.trim()) {
      return NextResponse.json({ error: "Competitor link is required" }, { status: 400 });
    }

    if ((body.evidenceMode === "file" || body.evidenceMode === "photo") && !body.evidenceFile) {
      return NextResponse.json({ error: "Please upload or capture evidence" }, { status: 400 });
    }

    if (!body.product.productId) {
      return NextResponse.json({ error: "Product is required" }, { status: 400 });
    }

    const quoteNumber = generatePriceMatchNumber();
    const quotePayload = buildQuotePayloadFromPriceMatch(body);
    const storedQuote = await storeQuote(quotePayload, quoteNumber);

    if (storedQuote) {
      try {
        const emailAttachments =
          body.evidenceFile &&
          (body.evidenceMode === "file" || body.evidenceMode === "photo")
            ? [
                {
                  name: body.evidenceFile.name,
                  contentBase64: body.evidenceFile.base64,
                },
              ]
            : undefined;
        await sendQuoteCreatedEmail(storedQuote, { attachments: emailAttachments });
      } catch (emailError) {
        console.error("Price match email failed:", emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Price match request submitted successfully",
      quote_id: storedQuote?.id || quoteNumber,
      quote_number: quoteNumber,
    });
  } catch (error) {
    console.error("Price match request error:", error);
    return NextResponse.json(
      { error: "Failed to process price match request. Please try again." },
      { status: 500 },
    );
  }
}
