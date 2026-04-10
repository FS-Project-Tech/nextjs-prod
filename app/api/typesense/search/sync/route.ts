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

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    await client.collections("products").documents().upsert(body);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}