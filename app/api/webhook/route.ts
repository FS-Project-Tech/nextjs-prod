import { NextRequest } from "next/server";
import { ewayWebhookGet, ewayWebhookPost } from "@/lib/payment/ewayWebhookHandler";

export const dynamic = "force-dynamic";

export const GET = ewayWebhookGet;

export async function POST(req: NextRequest) {
  return ewayWebhookPost(req);
}
