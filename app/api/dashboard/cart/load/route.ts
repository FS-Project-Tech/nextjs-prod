import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getWpBaseUrl } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const wpToken = (nextAuthToken as any)?.wpToken;
    // Return 401 when no token so CartProvider retries until session is ready (fixes empty cart on new browser)
    if (!wpToken) {
      return NextResponse.json({ items: [], error: "Not authenticated" }, { status: 401 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const res = await fetch(`${wpBase}/wp-json/customers/v1/headless-cart`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${wpToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // Propagate 401 so client retries until WordPress auth works (cross-browser cart)
      if (res.status === 401) {
        return NextResponse.json({ items: [], error: "Not authenticated" }, { status: 401 });
      }
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[dashboard/cart/load] error", error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
