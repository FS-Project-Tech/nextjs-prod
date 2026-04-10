/**
 * eWAY async payment notifications (production URL).
 * Same handler as `/api/webhook/eway` — configure eWAY to POST here or to the legacy path.
 */
import { NextRequest } from "next/server";
import { ewayWebhookGet, ewayWebhookPost } from "@/lib/payment/ewayWebhookHandler";

export const dynamic = "force-dynamic";

export const GET = ewayWebhookGet;

export async function POST(req: NextRequest): Promise<Response> {
  return ewayWebhookPost(req);
}
