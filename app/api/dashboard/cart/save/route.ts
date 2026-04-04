import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getWpBaseUrl } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const wpToken = (nextAuthToken as any)?.wpToken;
    if (!wpToken) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json(
        { success: false, error: "WordPress URL not configured" },
        { status: 500 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const items = Array.isArray(body.items) ? body.items : [];

    const res = await fetch(`${wpBase}/wp-json/customers/v1/headless-cart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${wpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (process.env.NODE_ENV === "development") {
        console.warn("[dashboard/cart/save] backend error", res.status, text.slice(0, 200));
      }
      return NextResponse.json({ success: false }, { status: 200 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[dashboard/cart/save] error", error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
