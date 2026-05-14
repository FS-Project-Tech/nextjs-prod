//D:\stage-joya\nextjs-prod-main\components\feedback\FeedbackFreeformClient.tsx

"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

import { feedbackInputClass, feedbackLabelClass } from "@/components/feedback/feedbackFormStyles";

export default function FeedbackFreeformClient() {
  const { data: session, status } = useSession();
  const [freeform, setFreeform] = useState("");
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

    const trimmed = freeform.trim();
    if (!trimmed) {
      setFormMsg({ type: "err", text: "Please enter your feedback before sending." });
      return;
    }

    const payload = {
      mode: "freeform" as const,
      ...(needsGuestEmail ? { guestEmail: guestEmail.trim() } : {}),
      message: trimmed,
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
      setFreeform("");
      setGuestEmail("");
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
          <label className={feedbackLabelClass}>
            Email
            <input
              type="email"
              autoComplete="email"
              className={feedbackInputClass}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={status === "loading"}
            />
          </label>
          <p className="mt-1 text-xs text-gray-500">Required so we can follow up if needed.</p>
        </div>
      )}

      <label className={feedbackLabelClass}>
        Your feedback
        <textarea
          className={`${feedbackInputClass} min-h-[160px] resize-y`}
          rows={6}
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          placeholder="Tell us anything you’d like us to know…"
        />
      </label>

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
