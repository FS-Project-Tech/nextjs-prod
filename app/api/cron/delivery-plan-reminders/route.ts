import { NextRequest, NextResponse } from "next/server";
import {
  isDeliveryReminderAuthorized,
  runDeliveryPlanReminderSweep,
} from "@/lib/delivery-plan/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trigger recurring delivery reminder sweep (emails when next cycle is in DELIVERY_PLAN_REMINDER_LEAD_DAYS days).
 * Protect with DELIVERY_PLAN_REMINDER_SECRET or CRON_SECRET; call daily (e.g. Vercel Cron GET).
 * Requires BREVO_API_KEY and order line meta from checkout (delivery plan).
 */
async function handle(req: NextRequest) {
  if (!isDeliveryReminderAuthorized(req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDeliveryPlanReminderSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to run reminder sweep";
    console.error("[delivery-reminder] cron failed", error);
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

/** Vercel Cron invokes GET requests. */
export async function GET(req: NextRequest) {
  return handle(req);
}
