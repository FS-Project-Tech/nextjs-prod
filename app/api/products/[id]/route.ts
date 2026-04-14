import { NextRequest, NextResponse } from "next/server";
import { fetchProduct } from "@/lib/woocommerce";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const { id } = await params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return withRequestId(NextResponse.json({ error: "Invalid product ID" }, { status: 400 }), requestId);
    }

    const product = await fetchProduct(productId);

    return withRequestId(NextResponse.json(product), requestId);
  } catch (error) {
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "Failed to fetch product",
      logPrefix: "api/products/[id]",
    });
  }
}
