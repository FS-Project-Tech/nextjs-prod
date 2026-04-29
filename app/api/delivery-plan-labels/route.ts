import { NextResponse } from "next/server";
import {
  parseGlobalDeliveryPlansPayload,
  toDeliveryPlanOrder,
} from "@/lib/delivery-plan/global-delivery-plans-shared";

export const revalidate = 300;

export async function GET() {
  const base = process.env.NEXT_PUBLIC_WP_URL?.replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json({ plans: null });
  }

  try {
    const url = `${base}/wp-json/joya/v1/global-delivery-plans`;
    const res = await fetch(url, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({ plans: null });
    }
    const raw: unknown = await res.json();
    const parsed = parseGlobalDeliveryPlansPayload(raw);
    if (!parsed) {
      return NextResponse.json({ plans: null });
    }
    const order = toDeliveryPlanOrder(parsed);
    return NextResponse.json({ plans: parsed, order });
  } catch {
    return NextResponse.json({ plans: null });
  }
}
