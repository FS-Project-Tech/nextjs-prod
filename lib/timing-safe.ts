import crypto from "crypto";

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aa = Buffer.from(String(a).replace(/^0x/i, ""), "hex");
    const bb = Buffer.from(String(b).replace(/^0x/i, ""), "hex");
    if (aa.length !== bb.length || aa.length === 0) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}
