import { NextRequest, NextResponse } from "next/server";

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_API_KEY = process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    const res = await fetch(
      `${TYPESENSE_HOST}/collections/products_updated/documents/${id}`,
      {
        method: "DELETE",
        headers: {
          "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
        },
      }
    );

    const data = await res.json();

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}