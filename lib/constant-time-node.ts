import "server-only";
import crypto from "crypto";

export function constantTimeEqualString(secret: string, presented: string): boolean {
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function readBearerToken(req: { headers: Headers }): string {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}
