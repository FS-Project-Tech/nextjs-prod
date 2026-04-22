import { NextRequest, NextResponse } from "next/server";

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_API_KEY = process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { product_id } = await req.json();

    // 1. Fetch product from WP API
    const res = await fetch(
      `${process.env.WP_URL}/wp-json/custom/v1/typesense-products`
    );

    const products = await res.json();

    const product = products.find((p: any) => p.id == product_id);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 2. Send to Typesense
    const typesenseRes = await fetch(
      `${TYPESENSE_HOST}/collections/products_updated/documents`,
      {
        method: "POST",
        headers: {
          "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(product),
      }
    );

    const data = await typesenseRes.json();

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}



