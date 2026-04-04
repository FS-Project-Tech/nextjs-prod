"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isValidName, isValidEmail, nameCharsOnly } from "@/lib/form-validation";

export default function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next") || "/account";
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const firstName = String(formData.get("firstName")).trim();
      const lastName = String(formData.get("lastName")).trim();
      const email = String(formData.get("email")).trim();
      const password = String(formData.get("password"));
      const confirmPassword = String(formData.get("confirmPassword"));

      const errs: Record<string, string> = {};
      if (!firstName) errs.firstName = "First name is required";
      else if (!isValidName(firstName))
        errs.firstName = "Letters, spaces, hyphens and apostrophes only";
      if (!lastName) errs.lastName = "Last name is required";
      else if (!isValidName(lastName))
        errs.lastName = "Letters, spaces, hyphens and apostrophes only";
      if (!email) errs.email = "Email is required";
      else if (!isValidEmail(email)) errs.email = "Invalid email format";
      if (!password) errs.password = "Password is required";
      else if (password.length < 8) errs.password = "Password must be at least 8 characters";
      if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match";

      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setFormError(Object.values(errs)[0]);
        setLoading(false);
        return;
      }

      const payload = {
        email,
        password,
        firstName,
        lastName,
      };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error?.message || "Unable to register.");
      }

      router.replace(result.redirectTo || `/login?next=${encodeURIComponent(nextParam)}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-lg">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
        <p className="text-sm text-slate-500">
          Already registered?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(nextParam)}`}
            className="text-teal-600 font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" aria-live="polite">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">
              First name
              <input
                type="text"
                name="firstName"
                required
                autoComplete="given-name"
                onInput={(e) => {
                  e.currentTarget.value = nameCharsOnly(e.currentTarget.value);
                }}
                className={`mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 ${fieldErrors.firstName ? "border-red-300 focus:ring-red-500/40" : "border-slate-300"}`}
              />
            </label>
            {fieldErrors.firstName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Last name
              <input
                type="text"
                name="lastName"
                required
                autoComplete="family-name"
                onInput={(e) => {
                  e.currentTarget.value = nameCharsOnly(e.currentTarget.value);
                }}
                className={`mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 ${fieldErrors.lastName ? "border-red-300 focus:ring-red-500/40" : "border-slate-300"}`}
              />
            </label>
            {fieldErrors.lastName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Email address
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className={`mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 ${fieldErrors.email ? "border-red-300 focus:ring-red-500/40" : "border-slate-300"}`}
            />
          </label>
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="new-password"
              minLength={8}
              className={`mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 ${fieldErrors.password ? "border-red-300 focus:ring-red-500/40" : "border-slate-300"}`}
            />
          </label>
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Confirm password
            <input
              type="password"
              name="confirmPassword"
              required
              autoComplete="new-password"
              className={`mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 ${fieldErrors.confirmPassword ? "border-red-300 focus:ring-red-500/40" : "border-slate-300"}`}
            />
          </label>
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded-md bg-teal-600 px-4 py-2 font-medium text-white shadow hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-xs text-slate-400">
          By creating an account you agree to our{" "}
          <Link href="/legal/terms" className="text-teal-500 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-teal-500 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
