import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getClientIp } from "@/lib/api-rate-limit";

/**
 * Prefer logged-in user id for rate-limit buckets; fall back to IP (prefixed for stable namespacing).
 */
export async function getRateLimitIdentity(req: NextRequest): Promise<string> {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (secret) {
      const token = await getToken({ req, secret });
      const sub = token?.sub;
      if (sub != null && String(sub).trim() !== "") {
        return `uid:${String(sub).trim()}`;
      }
    }
  } catch {
    /* unauthenticated or invalid token */
  }
  return `ip:${getClientIp(req)}`;
}
