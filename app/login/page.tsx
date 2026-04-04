"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { Shield } from "lucide-react";
import Link from "next/link";
import { AuthSideBanner } from "@/components/auth/AuthSideBanner";
import { useSession } from "next-auth/react";
import { validateNextParam, ALLOWED_REDIRECT_PATHS } from "@/lib/redirectUtils";

/** Only show loading UI if the operation takes longer than this (ms). Fast loads show nothing. */
const SESSION_LOADING_DELAY_MS = 700;
const REDIRECT_LOADING_DELAY_MS = 400;

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const [showSessionLoading, setShowSessionLoading] = useState(false);
  const [showRedirecting, setShowRedirecting] = useState(false);
  const sessionDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Secure redirect resolver
  const resolveRedirect = useCallback(() => {
    if (!params) return "/dashboard";
    const nextParam = params.get("next");
    return validateNextParam(nextParam, ALLOWED_REDIRECT_PATHS, "/dashboard");
  }, [params]);

  // ✅ Redirect authenticated users
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    router.replace(resolveRedirect());
  }, [status, user, resolveRedirect]);

  // ✅ Show "Checking session…" only if session check takes longer than delay (avoids flash when fast)
  useEffect(() => {
    if (status !== "loading") {
      if (sessionDelayRef.current) {
        clearTimeout(sessionDelayRef.current);
        sessionDelayRef.current = null;
      }
      setShowSessionLoading(false);
      return;
    }
    sessionDelayRef.current = setTimeout(() => {
      sessionDelayRef.current = null;
      setShowSessionLoading(true);
    }, SESSION_LOADING_DELAY_MS);
    return () => {
      if (sessionDelayRef.current) {
        clearTimeout(sessionDelayRef.current);
        sessionDelayRef.current = null;
      }
    };
  }, [status]);

  // ✅ Show "Redirecting…" only if redirect takes longer than delay
  useEffect(() => {
    if (status !== "authenticated" || !user) {
      if (redirectDelayRef.current) {
        clearTimeout(redirectDelayRef.current);
        redirectDelayRef.current = null;
      }
      setShowRedirecting(false);
      return;
    }
    redirectDelayRef.current = setTimeout(() => {
      redirectDelayRef.current = null;
      setShowRedirecting(true);
    }, REDIRECT_LOADING_DELAY_MS);
    return () => {
      if (redirectDelayRef.current) {
        clearTimeout(redirectDelayRef.current);
        redirectDelayRef.current = null;
      }
    };
  }, [status, user]);

  // ✅ Loading state: only show after delay (so fast session check never shows this)
  if (status === "loading" && showSessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600"
          aria-hidden
        />
        <p className="text-gray-600 text-sm">Loading…</p>
      </div>
    );
  }

  // ✅ Already authenticated: only show redirect message after delay
  if (status === "authenticated" && user && showRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-600 text-sm">Redirecting to your account…</p>
      </div>
    );
  }

  // ✅ Login UI — same split card as /register (embedded banner, fixed promo bounds in AuthSideBanner)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 py-8 sm:py-10 lg:py-12">
      <div className="mx-auto flex w-full max-w-[min(88rem,calc(100%-1.5rem))] justify-center px-3 sm:px-5">
        <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50 lg:min-h-[min(640px,calc(100dvh-10rem))] lg:max-h-[calc(100dvh-8rem)] lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12 xl:px-14">
            <div className="mx-auto w-full max-w-xl">
              <div className="mb-8 text-center lg:text-left">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 antialiased">
                  Welcome
                </h1>
                <p className="mt-2 text-sm text-slate-600">Sign in to your account to continue</p>
              </div>

              <LoginForm />

              <div className="mt-6 text-center lg:text-left">
                <p className="text-sm text-slate-600">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/register"
                    className="font-semibold text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:text-teal-800"
                  >
                    Create one now
                  </Link>
                </p>
              </div>

              <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500 lg:justify-start">
                <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Secure login with encrypted connection</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center border-t border-slate-100 bg-slate-50/90 px-4 py-8 sm:px-6 lg:w-[min(54%,640px)] lg:border-l lg:border-t-0 lg:px-8 lg:py-10 xl:px-10">
            <AuthSideBanner variant="login" embedded />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
