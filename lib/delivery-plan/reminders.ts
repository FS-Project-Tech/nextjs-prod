import wcAPI from "@/lib/woocommerce";
import { constantTimeEqualString } from "@/lib/constant-time-node";
import { getDeliveryFrequencyLabel } from "@/lib/delivery-utils";
import { mergeWooOrderMetaByKey } from "@/lib/woo/orderMeta";
import { sendPlainEmailViaBrevo } from "@/lib/email/sendViaBrevo";
import { DELIVERY_PLAN_META_CODE } from "@/lib/checkout/deliveryPlanOrder";

type WooOrderMeta = { id?: number; key?: string; value?: unknown };
type WooLineMeta = { key?: string; value?: unknown };
type WooLineItem = {
  id?: number;
  product_id?: number;
  variation_id?: number;
  name?: string;
  quantity?: number;
  sku?: string;
  meta_data?: WooLineMeta[];
};
type WooOrder = {
  id?: number;
  number?: string;
  order_number?: string;
  date_created?: string;
  status?: string;
  total?: string;
  currency?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  shipping?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items?: WooLineItem[];
  meta_data?: WooOrderMeta[];
};

const RECURRING_PLAN_DAYS: Record<string, number> = { "7": 7, "14": 14, "30": 30 };

/** Days before the next cycle date when the internal reminder email is sent (default 7). */
function reminderLeadDays(): number {
  const raw = process.env.DELIVERY_PLAN_REMINDER_LEAD_DAYS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  return 7;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function utcDateYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parsePlanFromLineMeta(line: WooLineItem): string | null {
  const meta = Array.isArray(line.meta_data) ? line.meta_data : [];
  for (const row of meta) {
    if (String(row?.key || "") !== DELIVERY_PLAN_META_CODE) continue;
    const raw = row?.value;
    const plan = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (plan in RECURRING_PLAN_DAYS) return plan;
  }
  return null;
}

function isReminderSentForDate(order: WooOrder, reminderDateIso: string): boolean {
  const key = `_joya_delivery_reminder_sent_${reminderDateIso}`;
  const rows = Array.isArray(order.meta_data) ? order.meta_data : [];
  return rows.some((row) => String(row?.key || "") === key);
}

async function markReminderSent(order: WooOrder, reminderDateIso: string): Promise<void> {
  const orderId = Number(order.id || 0);
  if (!Number.isFinite(orderId) || orderId <= 0) return;
  const key = `_joya_delivery_reminder_sent_${reminderDateIso}`;
  const existing = Array.isArray(order.meta_data) ? order.meta_data : [];
  const merged = mergeWooOrderMetaByKey(existing as Array<{ id?: number; key: string; value: unknown }>, [
    { key, value: new Date().toISOString() },
  ]);
  await wcAPI.put(`/orders/${orderId}`, { meta_data: merged });
}

function recurringLinesDueInLeadWindow(order: WooOrder, now: Date): Array<{
  plan: string;
  intervalDays: number;
  nextDueIso: string;
  line: WooLineItem;
}> {
  const createdRaw = order.date_created;
  if (!createdRaw) return [];
  const createdAt = new Date(createdRaw);
  if (Number.isNaN(createdAt.getTime())) return [];

  const createdDay = startOfUtcDay(createdAt);
  const today = startOfUtcDay(now);
  const leadDays = reminderLeadDays();
  const leadTargetDay = addUtcDays(today, leadDays);
  const daysSince = Math.floor((today.getTime() - createdDay.getTime()) / 86_400_000);
  if (daysSince < 0) return [];

  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  const result: Array<{ plan: string; intervalDays: number; nextDueIso: string; line: WooLineItem }> = [];

  for (const line of lines) {
    const plan = parsePlanFromLineMeta(line);
    if (!plan) continue;
    const intervalDays = RECURRING_PLAN_DAYS[plan];
    const cycle = Math.floor(daysSince / intervalDays);
    const nextDueDate = addUtcDays(createdDay, (cycle + 1) * intervalDays);
    const dueOnLeadDay = nextDueDate.getTime() === leadTargetDay.getTime();
    if (!dueOnLeadDay) continue;
    result.push({
      plan,
      intervalDays,
      nextDueIso: utcDateYmd(nextDueDate),
      line,
    });
  }
  return result;
}

function orderRef(order: WooOrder): string {
  const n = typeof order.number === "string" && order.number.trim() ? order.number.trim() : "";
  if (n) return n;
  const on = typeof order.order_number === "string" && order.order_number.trim() ? order.order_number.trim() : "";
  if (on) return on;
  return String(order.id ?? "");
}

function buildReminderEmailBody(
  order: WooOrder,
  dueLines: Array<{
    plan: string;
    intervalDays: number;
    nextDueIso: string;
    line: WooLineItem;
  }>,
  leadDays: number,
): string {
  const billing = order.billing || {};
  const shipping = order.shipping || {};
  const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim() || "N/A";
  const billingAddress = [
    billing.address_1,
    billing.address_2,
    [billing.city, billing.state, billing.postcode].filter(Boolean).join(" "),
    billing.country,
  ]
    .filter(Boolean)
    .join(", ");
  const shippingAddress = [
    shipping.address_1,
    shipping.address_2,
    [shipping.city, shipping.state, shipping.postcode].filter(Boolean).join(" "),
    shipping.country,
  ]
    .filter(Boolean)
    .join(", ");

  const lines = dueLines
    .map((row) => {
      const qty = Number(row.line.quantity || 0) || 0;
      const sku = row.line.sku ? ` (SKU: ${row.line.sku})` : "";
      const title = row.line.name || `Product #${row.line.product_id || "N/A"}`;
      return `- ${title}${sku}, qty ${qty}, plan: ${getDeliveryFrequencyLabel(row.plan)}, next due: ${row.nextDueIso}`;
    })
    .join("\n");

  return `
Delivery plan reminder (${leadDays} day(s) before next cycle)

Order: #${orderRef(order)} (Woo ID: ${order.id ?? "N/A"})
Order status: ${order.status || "N/A"}
Order total: ${order.total || "N/A"} ${order.currency || "AUD"}

Customer details
- Name: ${customerName}
- Email: ${billing.email || "N/A"}
- Phone: ${billing.phone || "N/A"}
- Company: ${billing.company || "N/A"}

Billing address
${billingAddress || "N/A"}

Shipping address
${shippingAddress || "N/A"}

Products with recurring plan — next cycle due on the dates below (reminder sent ${leadDays} day(s) in advance)
${lines}
`.trim();
}

async function sendReminderEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (process.env.BREVO_API_KEY?.trim()) {
    const brevo = await sendPlainEmailViaBrevo({
      to: params.to,
      subject: params.subject,
      text: params.text,
      senderName: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Joya Medical Supplies",
    });
    if (brevo.ok) return { ok: true };
    if (brevo.ok === false) {
      return { ok: false, detail: brevo.detail };
    }
    return { ok: false, detail: "Unknown Brevo error" };
  }
  return {
    ok: false,
    detail: "BREVO_API_KEY not configured for delivery reminder emails.",
  };
}

async function listCandidateOrders(): Promise<WooOrder[]> {
  const statuses = ["processing", "completed", "on-hold"];
  const out: WooOrder[] = [];
  for (const status of statuses) {
    let page = 1;
    while (page <= 10) {
      const { data } = await wcAPI.get("/orders", {
        params: {
          status,
          per_page: 100,
          page,
          orderby: "date",
          order: "desc",
        },
      });
      const rows = Array.isArray(data) ? (data as WooOrder[]) : [];
      if (rows.length === 0) break;
      out.push(...rows);
      if (rows.length < 100) break;
      page += 1;
    }
  }
  return out;
}

export async function runDeliveryPlanReminderSweep(now: Date = new Date()): Promise<{
  scanned: number;
  eligible: number;
  sent: number;
  failed: number;
}> {
  const leadDays = reminderLeadDays();
  const recipient =
    process.env.DELIVERY_PLAN_REMINDER_TO?.trim() || "info@joyamedicalsupplies.com.au";
  const orders = await listCandidateOrders();
  let eligible = 0;
  let sent = 0;
  let failed = 0;

  for (const order of orders) {
    const dueLines = recurringLinesDueInLeadWindow(order, now);
    if (dueLines.length === 0) continue;
    const reminderDateIso = utcDateYmd(startOfUtcDay(now));
    if (isReminderSentForDate(order, reminderDateIso)) continue;
    eligible += 1;

    const subject = `[Delivery Reminder] Order #${orderRef(order)} — recurring items due in ${leadDays} day(s)`;
    const text = buildReminderEmailBody(order, dueLines, leadDays);
    const email = await sendReminderEmail({ to: recipient, subject, text });
    if (email.ok) {
      await markReminderSent(order, reminderDateIso);
      sent += 1;
    } else {
      failed += 1;
      if (email.ok === false) {
        console.error("[delivery-reminder] email failed", {
          orderId: order.id,
          orderRef: orderRef(order),
          detail: email.detail,
        });
      }
    }
  }

  return {
    scanned: orders.length,
    eligible,
    sent,
    failed,
  };
}

export function isDeliveryReminderAuthorized(headers: Headers): boolean {
  const secret =
    process.env.DELIVERY_PLAN_REMINDER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = headers.get("authorization") || "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!presented) return false;
  return constantTimeEqualString(secret, presented);
}
