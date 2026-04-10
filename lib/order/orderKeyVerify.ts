import { timingSafeEqual } from "node:crypto";

export function keysMatchWooOrder(wooKey: string, provided: string): boolean {
  const a = String(wooKey || "");
  const b = String(provided || "");
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
