"use client";
 
import { useState, useRef } from "react";
 
const TOPICS = [
  { value: "", label: "Choose a topic…" },
  { value: "Product", label: "Product Inquiry" },
  { value: "ndis", label: "NDIS Regarding Inquiry" },
  { value: "other", label: "Other" },
];
 
type ContactUsFormProps = {
  /** Teal hero section (light text, bordered submit) vs white card (default). */
  variant?: "light" | "dark";
};
 
export default function ContactUsForm({ variant = "light" }: ContactUsFormProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");
  /** Bump after successful submit so the form remounts with empty fields (reset() alone is unreliable after async + React/autofill). */
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
 
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = formRef.current ?? e.currentTarget;
    setErrMsg("");
    setStatus("sending");
    const fd = new FormData(formEl);
    const payload = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      topic: fd.get("topic"),
      message: fd.get("message"),
    };
    const safePayload = {
      firstName: String(payload.firstName ?? ""),
      lastName: String(payload.lastName ?? ""),
      phone: String(payload.phone ?? ""),
      email: String(payload.email ?? ""),
      topic: String(payload.topic ?? ""),
      message: String(payload.message ?? ""),
    };
 
    try {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/contact`
          : "/api/contact";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(safePayload),
        credentials: "same-origin",
        cache: "no-store",
      });
 
      const text = await res.text();
      let data: { error?: string; _debug?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        data = {
          error: `Unexpected response (${res.status}). Check the browser Network tab for /api/contact.`,
        };
      }
 
      if (!res.ok) {
        const extra =
          process.env.NODE_ENV === "development" && data._debug
            ? ` ${data._debug}`
            : "";
        setErrMsg((data.error || "Something went wrong.") + extra);
        setStatus("err");
        return;
      }
 
      setStatus("ok");
      try {
        formEl.reset();
      } catch {
        /* ignore */
      }
      setFormKey((k) => k + 1);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed")
      ) {
        setErrMsg(
          "Could not reach the server. Confirm `npm run dev` is running, then try again. If you use an ad-blocker, allow requests to this site."
        );
      } else {
        setErrMsg(msg || "Network error. Please try again.");
      }
      setStatus("err");
      if (process.env.NODE_ENV === "development") {
        console.error("[contact form]", err);
      }
    }
  }
 
  const isDark = variant === "dark";
  const input = isDark
    ? "w-full rounded-lg border border-white/40 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600 shadow-sm focus:border-white focus:outline-none focus:ring-2 focus:ring-white/50"
    : "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const label = isDark
    ? "mb-1 block text-sm font-medium text-white/95"
    : "mb-1 block text-sm font-medium text-gray-700";
 
  const okMsg = isDark ? "text-sm font-medium text-emerald-200" : "text-sm font-medium text-green-700";
  const errText = isDark ? "text-sm text-red-200" : "text-sm text-red-600";
  const submitBtn = isDark
    ? "rounded-lg border-2 border-white bg-transparent px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
    : "rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-60";
 
  return (
    <form
      key={formKey}
      ref={formRef}
      onSubmit={onSubmit}
      className="space-y-4"
    >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="cu-first">
                First name
              </label>
              <input id="cu-first" name="firstName" required className={input} autoComplete="given-name" />
            </div>
            <div>
              <label className={label} htmlFor="cu-last">
                Last name
              </label>
              <input id="cu-last" name="lastName" required className={input} autoComplete="family-name" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="cu-phone">
                Phone
              </label>
              <input id="cu-phone" name="phone" type="tel" className={input} autoComplete="tel" />
            </div>
            <div>
              <label className={label} htmlFor="cu-email">
                Email
              </label>
              <input id="cu-email" name="email" type="email" required className={input} autoComplete="email" />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="cu-topic">
              Topic
            </label>
            <select id="cu-topic" name="topic" required className={input} defaultValue="">
              {TOPICS.map((t) => (
                <option key={t.value || "empty"} value={t.value} disabled={t.value === ""}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="cu-msg">
              Message
            </label>
            <textarea id="cu-msg" name="message" required rows={5} className={input} placeholder="How can we help?" />
          </div>
 
          {status === "ok" && (
            <p className={okMsg} role="status">
              Thanks — we&apos;ll get back to you soon.
            </p>
          )}
          {status === "err" && errMsg && (
            <p className={errText} role="alert">
              {errMsg}
            </p>
          )}
 
          <button
            type="submit"
            disabled={status === "sending"}
            className={submitBtn}
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </button>
        </form>
  );
}