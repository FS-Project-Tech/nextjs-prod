import { NextRequest, NextResponse } from "next/server";
import {
  trackPurchaseServerSide,
  type ServerPurchaseItem,
  type ServerPurchasePayload,
} from "@/lib/analytics/server-track-purchase";
import { readJsonBody } from "@/utils/api-parse";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseItems(raw: unknown): ServerPurchaseItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ServerPurchaseItem[] = [];
  for (const row of raw) {
    if (!isRecord(row)) return null;
    const id = row.id;
    if (id == null || (typeof id !== "string" && typeof id !== "number")) return null;
    const name = row.name;
    if (typeof name !== "string" || !name.trim()) return null;
    const price = row.price;
    const quantity = row.quantity;
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 1) return null;
    out.push({ id, name: name.trim(), price, quantity: Math.floor(quantity) });
  }
  return out;
}

function parseBody(body: unknown): ServerPurchasePayload | NextResponse {
  if (!isRecord(body)) {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const orderId = body.orderId;
  if (typeof orderId !== "string" || !orderId.trim()) {
    return NextResponse.json({ success: false, error: "orderId is required" }, { status: 400 });
  }
  const value = body.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NextResponse.json({ success: false, error: "value must be a finite number" }, { status: 400 });
  }
  const currency = body.currency;
  if (typeof currency !== "string" || !currency.trim()) {
    return NextResponse.json({ success: false, error: "currency is required" }, { status: 400 });
  }
  const items = parseItems(body.items);
  if (items === null) {
    return NextResponse.json(
      { success: false, error: "items must be an array of { id, name, price, quantity }" },
      { status: 400 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: "items must not be empty" }, { status: 400 });
  }
  let email: string | undefined;
  if (body.email !== undefined) {
    if (typeof body.email !== "string") {
      return NextResponse.json({ success: false, error: "email must be a string" }, { status: 400 });
    }
    const t = body.email.trim();
    email = t || undefined;
  }
  return {
    orderId: orderId.trim(),
    value,
    currency: currency.trim().toUpperCase(),
    email,
    items,
  };
}

export async function POST(req: NextRequest) {
  const raw = await readJsonBody(req);
  const parsed = parseBody(raw);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  await trackPurchaseServerSide(parsed);

  return NextResponse.json({ success: true });
}
