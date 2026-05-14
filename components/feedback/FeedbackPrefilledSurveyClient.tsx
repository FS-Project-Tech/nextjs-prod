//D:\stage-joya\nextjs-prod-main\components\feedback\FeedbackPrefilledSurveyClient.tsx

"use client";

import { useSession } from "next-auth/react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import {
  feedbackInputClass as inputClass,
  feedbackLabelClass as labelClass,
} from "@/components/feedback/feedbackFormStyles";

type SurveyFormState = {
  customerType: string;
  customerTypeOther: string;
  purchaseFrequency: string;
  interactions: string[];
  websiteExperience: string;
  findProducts: string;
  deliverySatisfaction: string;
  freeDeliveryInfluence: string;
  packagingQuality: string;
  supportRating: string;
  phoneExperience: string;
  responseEmail: string;
  responseLiveChat: string;
  refundTimely: string;
  orderAsExpected: string;
  orderAsExpectedDetails: string;
  storePickup: string;
  overallSatisfaction: string;
  recommendScore: string;
  didWell: string;
  improve: string;
  productHelp: string;
  followUp: string;
  followUpContact: string;
};

const emptySurvey: SurveyFormState = {
  customerType: "",
  customerTypeOther: "",
  purchaseFrequency: "",
  interactions: [],
  websiteExperience: "",
  findProducts: "",
  deliverySatisfaction: "",
  freeDeliveryInfluence: "",
  packagingQuality: "",
  supportRating: "",
  phoneExperience: "",
  responseEmail: "",
  responseLiveChat: "",
  refundTimely: "",
  orderAsExpected: "",
  orderAsExpectedDetails: "",
  storePickup: "",
  overallSatisfaction: "",
  recommendScore: "",
  didWell: "",
  improve: "",
  productHelp: "",
  followUp: "",
  followUpContact: "",
};

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-start gap-2 text-sm text-gray-600">
          <input
            type="radio"
            name={name}
            className="mt-0.5 shrink-0 border-gray-300 text-[#1f605f] focus:ring-teal-600"
            checked={value === opt}
            onChange={() => onChange(opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  options: string[];
}) {
  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
  };
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0 rounded border-gray-300 text-[#1f605f] focus:ring-teal-600"
            checked={values.includes(opt)}
            onChange={() => toggle(opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <legend className="px-1 text-sm font-bold text-gray-900">{title}</legend>
      {children}
    </fieldset>
  );
}

const Q1 = [
  "Individual / personal use",
  "Carer",
  "Healthcare professional",
  "Aged care provider",
  "Other",
];
const Q2 = [
  "This is my first purchase",
  "I have purchased a few times",
  "I am a regular customer and purchase frequently",
];
const Q3 = [
  "Website purchase",
  "In-store purchase",
  "Store pickup (click & collect)",
  "Phone order",
  "Email enquiry",
  "Live chat",
  "Other",
];
const RATE4 = ["Excellent", "Good", "Average", "Poor"];
const Q5 = ["Very easy", "Somewhat easy", "Difficult"];
const Q6 = ["Very satisfied", "Satisfied", "Unsatisfied"];
const Q7 = ["Yes, significantly", "Somewhat", "Not at all", "Not applicable"];
const Q10 = [
  "Wait time was reasonable",
  "Wait time was too long",
  "I received a callback promptly",
  "I did not receive a callback",
  "Not applicable",
];
const RESPONSE_SCALE = ["Excellent", "Good", "Poor", "N/A"];
const Q12 = ["Yes", "No", "Not applicable"];
const Q13 = ["Yes", "No (please tell us more below)"];
const Q14 = ["Smooth and efficient", "Acceptable", "Needs improvement", "Not applicable"];
const Q15 = ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied"];
const Q20 = ["Yes (please leave contact details)", "No"];

function SurveyFields({
  s,
  set,
  scrollable,
}: {
  s: SurveyFormState;
  set: Dispatch<SetStateAction<SurveyFormState>>;
  /** Tighter scroll area (e.g. footer). Full page omits max-height. */
  scrollable?: boolean;
}) {
  const patch = useCallback(
    (p: Partial<SurveyFormState>) => {
      set((prev) => ({ ...prev, ...p }));
    },
    [set]
  );

  const npsOptions = useMemo(() => Array.from({ length: 11 }, (_, i) => String(i)), []);

  const outerClass = scrollable
    ? "max-h-[min(70vh,520px)] space-y-4 overflow-y-auto pr-1"
    : "space-y-4";

  return (
    <div className={outerClass}>
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 sm:text-sm">
        <p className="font-semibold text-gray-900">Joya Customer Experience Survey</p>
        <p className="mt-1">
          We&apos;re committed to providing the best possible service across every touchpoint. This
          short survey helps us understand what&apos;s working well and where we can improve.
        </p>
      </div>

      <Fieldset title="Customer">
        <div>
          <p className="text-sm font-medium text-neutral-800">1. Which best describes you?</p>
          <RadioGroup
            name="q1"
            value={s.customerType}
            onChange={(v) => patch({ customerType: v })}
            options={Q1}
          />
          {s.customerType === "Other" && (
            <label className={`${labelClass} mt-2`}>
              Please specify
              <input
                className={inputClass}
                value={s.customerTypeOther}
                onChange={(e) => patch({ customerTypeOther: e.target.value })}
                placeholder="Your role or context"
              />
            </label>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            2. How often have you purchased from JOYA Medical Supplies?
          </p>
          <RadioGroup
            name="q2"
            value={s.purchaseFrequency}
            onChange={(v) => patch({ purchaseFrequency: v })}
            options={Q2}
          />
        </div>
      </Fieldset>

      <Fieldset title="About your experience">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            3. How have you interacted with Joya? (Select all that apply)
          </p>
          <CheckboxGroup
            values={s.interactions}
            onChange={(v) => patch({ interactions: v })}
            options={Q3}
          />
        </div>
      </Fieldset>

      <Fieldset title="Ordering & website">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            4. How would you rate your website experience?
          </p>
          <RadioGroup
            name="q4"
            value={s.websiteExperience}
            onChange={(v) => patch({ websiteExperience: v })}
            options={RATE4}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            5. Was it easy to find the products you needed?
          </p>
          <RadioGroup
            name="q5"
            value={s.findProducts}
            onChange={(v) => patch({ findProducts: v })}
            options={Q5}
          />
        </div>
      </Fieldset>

      <Fieldset title="Delivery & packaging">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            6. How satisfied are you with delivery time?
          </p>
          <RadioGroup
            name="q6"
            value={s.deliverySatisfaction}
            onChange={(v) => patch({ deliverySatisfaction: v })}
            options={Q6}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            7. Did free delivery (if applicable) influence your purchase?
          </p>
          <RadioGroup
            name="q7"
            value={s.freeDeliveryInfluence}
            onChange={(v) => patch({ freeDeliveryInfluence: v })}
            options={Q7}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            8. How would you rate the quality of packaging?
          </p>
          <RadioGroup
            name="q8"
            value={s.packagingQuality}
            onChange={(v) => patch({ packagingQuality: v })}
            options={RATE4}
          />
        </div>
      </Fieldset>

      <Fieldset title="Customer support">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            9. How would you rate your experience with customer support?
          </p>
          <RadioGroup
            name="q9"
            value={s.supportRating}
            onChange={(v) => patch({ supportRating: v })}
            options={RATE4}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            10. If you contacted us by phone, how was your experience?
          </p>
          <RadioGroup
            name="q10"
            value={s.phoneExperience}
            onChange={(v) => patch({ phoneExperience: v })}
            options={Q10}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            11. How would you rate our response times? (If used)
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Email
              <select
                className={inputClass}
                value={s.responseEmail}
                onChange={(e) => patch({ responseEmail: e.target.value })}
              >
                <option value="">Select…</option>
                {RESPONSE_SCALE.map((o) => (
                  <option key={o} value={o} className="text-neutral-900">
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Live chat
              <select
                className={inputClass}
                value={s.responseLiveChat}
                onChange={(e) => patch({ responseLiveChat: e.target.value })}
              >
                <option value="">Select…</option>
                {RESPONSE_SCALE.map((o) => (
                  <option key={o} value={o} className="text-neutral-900">
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Fieldset>

      <Fieldset title="Orders & aftercare">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            12. If you requested a refund or return, was it handled in a timely manner?
          </p>
          <RadioGroup
            name="q12"
            value={s.refundTimely}
            onChange={(v) => patch({ refundTimely: v })}
            options={Q12}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">
            13. Did your order arrive as expected?
          </p>
          <RadioGroup
            name="q13"
            value={s.orderAsExpected}
            onChange={(v) => patch({ orderAsExpected: v })}
            options={Q13}
          />
          {s.orderAsExpected === "No (please tell us more below)" && (
            <label className={`${labelClass} mt-2`}>
              Tell us more
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                rows={3}
                value={s.orderAsExpectedDetails}
                onChange={(e) => patch({ orderAsExpectedDetails: e.target.value })}
              />
            </label>
          )}
        </div>
      </Fieldset>

      <Fieldset title="Store experience (if applicable)">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            14. How was your store pickup experience?
          </p>
          <RadioGroup
            name="q14"
            value={s.storePickup}
            onChange={(v) => patch({ storePickup: v })}
            options={Q14}
          />
        </div>
      </Fieldset>

      <Fieldset title="Overall experience">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            15. Overall, how satisfied are you with Joya?
          </p>
          <RadioGroup
            name="q15"
            value={s.overallSatisfaction}
            onChange={(v) => patch({ overallSatisfaction: v })}
            options={Q15}
          />
        </div>
        <div>
          <label className={labelClass}>
            16. How likely are you to recommend Joya to others? (0–10)
            <select
              className={inputClass}
              value={s.recommendScore}
              onChange={(e) => patch({ recommendScore: e.target.value })}
            >
              <option value="">Select…</option>
              {npsOptions.map((o) => (
                <option key={o} value={o} className="text-neutral-900">
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Fieldset>

      <Fieldset title="Open feedback">
        <label className={labelClass}>
          17. What did we do well?
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            rows={3}
            value={s.didWell}
            onChange={(e) => patch({ didWell: e.target.value })}
          />
        </label>
        <label className={labelClass}>
          18. What could we improve?
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            rows={3}
            value={s.improve}
            onChange={(e) => patch({ improve: e.target.value })}
          />
        </label>
        <label className={labelClass}>
          19. Is there anything specific you wish we provided to help you choose the right product /
          order online?
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            rows={3}
            value={s.productHelp}
            onChange={(e) => patch({ productHelp: e.target.value })}
          />
        </label>
      </Fieldset>

      <Fieldset title="Optional">
        <div>
          <p className="text-sm font-medium text-neutral-800">
            20. Would you like us to follow up with you?
          </p>
          <RadioGroup
            name="q20"
            value={s.followUp}
            onChange={(v) => patch({ followUp: v })}
            options={Q20}
          />
          {s.followUp === "Yes (please leave contact details)" && (
            <label className={`${labelClass} mt-2`}>
              Contact details
              <textarea
                className={`${inputClass} min-h-[72px] resize-y`}
                rows={2}
                value={s.followUpContact}
                onChange={(e) => patch({ followUpContact: e.target.value })}
                placeholder="Phone or email"
              />
            </label>
          )}
        </div>
      </Fieldset>
    </div>
  );
}

export { SurveyFields, emptySurvey };
export type { SurveyFormState };

/** Prefilled survey for full-page `/feedback/prefilled` (no inner max-height scroll). */
export default function FeedbackPrefilledSurveyClient() {
  const { data: session, status } = useSession();
  const [survey, setSurvey] = useState<SurveyFormState>(emptySurvey);
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const sessionEmail = session?.user?.email?.trim() || "";
  const needsGuestEmail = !sessionEmail;

  const submit = async () => {
    setFormMsg(null);
    if (needsGuestEmail) {
      const em = guestEmail.trim();
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setFormMsg({ type: "err", text: "Please enter a valid email address." });
        return;
      }
    }

    const payload = {
      mode: "survey" as const,
      ...(needsGuestEmail ? { guestEmail: guestEmail.trim() } : {}),
      survey: {
        customerType: survey.customerType || undefined,
        customerTypeOther: survey.customerTypeOther || undefined,
        purchaseFrequency: survey.purchaseFrequency || undefined,
        interactions: survey.interactions.length ? survey.interactions : undefined,
        websiteExperience: survey.websiteExperience || undefined,
        findProducts: survey.findProducts || undefined,
        deliverySatisfaction: survey.deliverySatisfaction || undefined,
        freeDeliveryInfluence: survey.freeDeliveryInfluence || undefined,
        packagingQuality: survey.packagingQuality || undefined,
        supportRating: survey.supportRating || undefined,
        phoneExperience: survey.phoneExperience || undefined,
        responseEmail: survey.responseEmail || undefined,
        responseLiveChat: survey.responseLiveChat || undefined,
        refundTimely: survey.refundTimely || undefined,
        orderAsExpected: survey.orderAsExpected || undefined,
        orderAsExpectedDetails: survey.orderAsExpectedDetails || undefined,
        storePickup: survey.storePickup || undefined,
        overallSatisfaction: survey.overallSatisfaction || undefined,
        recommendScore: survey.recommendScore || undefined,
        didWell: survey.didWell || undefined,
        improve: survey.improve || undefined,
        productHelp: survey.productHelp || undefined,
        followUp: survey.followUp || undefined,
        followUpContact: survey.followUpContact || undefined,
      },
    };

    setSubmitting(true);
    try {
      const url =
        typeof window !== "undefined" ? `${window.location.origin}/api/feedback` : "/api/feedback";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        cache: "no-store",
      });
      const text = await res.text();
      let data: { error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as { error?: string }) : {};
      } catch {
        data = { error: `Unexpected response (${res.status}).` };
      }
      if (!res.ok) {
        setFormMsg({ type: "err", text: data.error || "Something went wrong. Please try again." });
        return;
      }
      setFormMsg({ type: "ok", text: "Thank you — your feedback has been sent." });
      setGuestEmail("");
      setSurvey(emptySurvey);
    } catch {
      setFormMsg({ type: "err", text: "Could not reach the server. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {needsGuestEmail && (
        <div>
          <label className={labelClass}>
            Email
            <input
              type="email"
              autoComplete="email"
              className={inputClass}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={status === "loading"}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500">Required so we can follow up if needed.</p>
        </div>
      )}

      <SurveyFields s={survey} set={setSurvey} />

      {formMsg && (
        <p
          className={`text-sm ${formMsg.type === "ok" ? "text-green-800" : "text-amber-900"}`}
          role={formMsg.type === "err" ? "alert" : "status"}
        >
          {formMsg.text}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || status === "loading"}
        className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
