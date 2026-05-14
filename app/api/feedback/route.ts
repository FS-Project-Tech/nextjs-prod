//D:\stage-joya\nextjs-prod-main\app\api\feedback\route.ts

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/nextAuthOptions";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import {
  getFeedbackRecipientEmail,
  isFeedbackEmailConfigured,
  sendFeedbackEmail,
} from "@/lib/email/feedbackEmail";
import { parseJsonBody } from "@/lib/api-validation";
import {
  createApiErrorResponse,
  getRequestId,
  isUpstreamTransientError,
  withRequestId,
} from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

const looseString = z.string().trim().max(5000).optional();
const looseShort = z.string().trim().max(500).optional();

const surveyAnswersSchema = z.object({
  customerType: looseShort,
  customerTypeOther: looseShort,
  purchaseFrequency: looseShort,
  interactions: z.array(z.string().trim().max(200)).max(30).optional(),
  websiteExperience: looseShort,
  findProducts: looseShort,
  deliverySatisfaction: looseShort,
  freeDeliveryInfluence: looseShort,
  packagingQuality: looseShort,
  supportRating: looseShort,
  phoneExperience: looseShort,
  responseEmail: looseShort,
  responseLiveChat: looseShort,
  refundTimely: looseShort,
  orderAsExpected: looseShort,
  orderAsExpectedDetails: looseString,
  storePickup: looseShort,
  overallSatisfaction: looseShort,
  recommendScore: z.union([z.string().max(4), z.number()]).optional(),
  didWell: looseString,
  improve: looseString,
  productHelp: looseString,
  followUp: looseShort,
  followUpContact: looseString,
});

const feedbackSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("freeform"),
    guestEmail: z.string().trim().max(254).optional(),
    message: z.string().trim().min(1).max(10_000),
  }),
  z.object({
    mode: z.literal("survey"),
    guestEmail: z.string().trim().max(254).optional(),
    survey: surveyAnswersSchema,
  }),
]);

/** Plain-text email: each item is question on one line, answer on the next, blank line between items. */
function formatSurveyEmailBlocks(lines: Array<[string, string | undefined | null]>): string {
  return lines
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([question, answer]) => `${question.trim()}\n${String(answer).trim()}`)
    .join("\n\n");
}

function formatSurveyPlain(survey: z.infer<typeof surveyAnswersSchema>): string {
  const interactions =
    survey.interactions && survey.interactions.length > 0 ? survey.interactions.join(", ") : "";

  return formatSurveyEmailBlocks([
    [
      "1. Customer type",
      survey.customerType === "Other"
        ? `Other — ${survey.customerTypeOther || ""}`
        : survey.customerType,
    ],
    ["2. Purchase frequency", survey.purchaseFrequency],
    ["3. How you interacted", interactions],
    ["4. Website experience", survey.websiteExperience],
    ["5. Finding products", survey.findProducts],
    ["6. Delivery time", survey.deliverySatisfaction],
    ["7. Free delivery influence", survey.freeDeliveryInfluence],
    ["8. Packaging quality", survey.packagingQuality],
    ["9. Customer support", survey.supportRating],
    ["10. Phone experience", survey.phoneExperience],
    ["11. Email response times", survey.responseEmail],
    ["11. Live chat response times", survey.responseLiveChat],
    ["12. Refund / return timely", survey.refundTimely],
    ["13. Order as expected", survey.orderAsExpected],
    ["13. Details (if No)", survey.orderAsExpectedDetails],
    ["14. Store pickup", survey.storePickup],
    ["15. Overall satisfaction", survey.overallSatisfaction],
    ["16. Recommend (0–10)", survey.recommendScore != null ? String(survey.recommendScore) : ""],
    ["17. What we did well", survey.didWell],
    ["18. What to improve", survey.improve],
    ["19. Product / ordering help", survey.productHelp],
    [
      "20. Follow up",
      survey.followUp === "Yes (please leave contact details)"
        ? `Yes — ${survey.followUpContact || ""}`
        : survey.followUp,
    ],
  ]);
}

/**
 * POST /api/feedback
 * Customer experience survey or free-form feedback. Guests must supply email.
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const parsed = await parseJsonBody(req, feedbackSchema);
    if (parsed.ok === false) return withRequestId(parsed.response, requestId);

    const session = await getServerSession(authOptions);
    const sessionEmail =
      session?.user && typeof (session.user as { email?: string }).email === "string"
        ? sanitizeEmail((session.user as { email: string }).email)
        : "";

    const raw = parsed.data;
    const guestEmail = sanitizeEmail(raw.guestEmail || "");
    const replyTo = sessionEmail || guestEmail;

    if (!replyTo) {
      return withRequestId(
        secureResponse(
          {
            error: "Please enter your email address so we can follow up if needed.",
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        ),
        requestId
      );
    }

    const adminTo = getFeedbackRecipientEmail();

    if (!isFeedbackEmailConfigured()) {
      return withRequestId(
        secureResponse(
          {
            error:
              "Feedback email is not configured. Add BREVO_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS, or a WordPress URL with send-email support.",
            code: "NOT_CONFIGURED",
          },
          { status: 503 }
        ),
        requestId
      );
    }

    const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Joya Medical Supplies";
    const authLabel = session?.user ? "Signed-in customer" : "Guest";

    let subject: string;
    let plain: string;

    if (raw.mode === "freeform") {
      const message = sanitizeString(raw.message);
      subject = `Customer feedback (free-form) — ${siteName}`;
      plain = `
${authLabel}
Customer Email: ${replyTo}

Your message
${message}
`.trim();
    } else {
      subject = `Joya Customer Experience Survey — ${siteName}`;
      plain = `
${authLabel}
Customer Email: ${replyTo}

Joya Customer Experience Survey responses
---

${formatSurveyPlain(raw.survey)}
`.trim();
    }

    const sendResult = await sendFeedbackEmail({
      to: adminTo,
      subject,
      text: plain,
      replyTo,
      senderName: siteName,
    });

    if (sendResult.ok === true) {
      return withRequestId(secureResponse({ success: true }), requestId);
    }

    const lastError = sendResult.detail;
    const upstreamStatus = isUpstreamTransientError(lastError) ? 503 : 502;
    return withRequestId(
      secureResponse(
        {
          error: "Could not send your feedback. Try again later or contact us by phone or email.",
          code: "UPSTREAM_ERROR",
          ...(process.env.NODE_ENV === "production" && lastError ? { _debug: lastError } : {}),
        },
        {
          status: upstreamStatus,
          headers:
            upstreamStatus === 503
              ? { "Retry-After": "5", "Cache-Control": "no-store" }
              : undefined,
        }
      ),
      requestId
    );
  } catch (e) {
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: "Something went wrong. Please try again.",
      fallbackBody: {
        code: "INTERNAL_ERROR",
        ...(process.env.NODE_ENV === "production" && e instanceof Error
          ? { _debug: e.message }
          : {}),
      },
      logPrefix: "api/feedback",
    });
  }
}
