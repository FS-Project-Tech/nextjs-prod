import { NextRequest, NextResponse } from "next/server";
import Typesense from "typesense";

const client = new Typesense.Client({
  nodes: [{
    host: process.env.NEXT_PUBLIC_TYPESENSE_HOST!,
    port: 443,
    protocol: "https",
  }],
  apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!,
});

export async function DELETE(req: NextRequest) {
    
    const id = new URL(req.url).searchParams.get("id");

    await client.collections("products").documents(id!).delete();

return NextResponse.json({ success: true });
}