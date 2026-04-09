import { NextRequest } from "next/server";
import { ewayWebhookGet, ewayWebhookPost } from "@/lib/payment/ewayWebhookHandler";
import { API_RATE_LIMITS, rateLimit } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export const GET = ewayWebhookGet;

export async function POST(req: NextRequest) {
  const limit = await rateLimit(API_RATE_LIMITS.WEBHOOK_POST)(req);
  if (limit) return limit;

  return ewayWebhookPost(req);
}
