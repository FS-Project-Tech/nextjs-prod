"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useToast } from "@/components/ToastProvider";

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { success, error: showError } = useToast();

  const token = useMemo(() => (params.get("token") || "").trim(), [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const passwordError =
    password.length > 0 && password.length < 8 ? "Password must be at least 8 characters." : "";
  const confirmError =
    confirmPassword.length > 0 && password !== confirmPassword ? "Passwords do not match." : "";

  const canSubmit = !!token && password.length >= 8 && password === confirmPassword && !loading;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!token) {
      showError("Invalid or missing reset token. Please request a new reset link.");
      return;
    }

    if (password.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/api/auth/reset", {
        token,
        password,
      });
      setSubmitted(true);
      success("Password reset successful. You can now log in.");
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || "Unable to reset password. Please try again.";
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Invalid reset link</h3>
        <p className="text-sm text-gray-600">
          This password reset link is missing a token. Please request a new reset link.
        </p>
        <Link href="/forgot" className="inline-block text-sm font-medium text-teal-600 hover:text-teal-500">
          Back to forgot password
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Password updated</h3>
        <p className="text-sm text-gray-600">Your password has been reset successfully.</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-block text-sm font-medium text-teal-600 hover:text-teal-500"
        >
          Go to login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          New Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Enter new password"
        />
        {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm New Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Confirm new password"
        />
        {confirmError && <p className="mt-1 text-sm text-red-600">{confirmError}</p>}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Resetting..." : "Reset password"}
      </button>

      <div className="text-center text-sm">
        <Link href="/login" className="font-medium text-teal-600 hover:text-teal-500">
          Back to login
        </Link>
      </div>
    </form>
  );
}
