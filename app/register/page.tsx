"use client";

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import RegisterForm from "@/components/auth/RegisterForm";
import { AuthSideBanner } from "@/components/auth/AuthSideBanner";
import { useSession } from "next-auth/react";

function RegisterPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const user = session?.user ?? null;

  useEffect(() => {
    if (status === "authenticated" && user) {
      const nextParam = params?.get("next");
      router.replace(nextParam || "/account");
    }
  }, [status, user, params, router]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 py-8 sm:py-10 lg:py-12">
      <div className="mx-auto flex w-full max-w-[min(88rem,calc(100%-1.5rem))] justify-center px-3 sm:px-5">
        <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50 lg:min-h-[min(640px,calc(100dvh-10rem))] lg:max-h-[calc(100dvh-8rem)] lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12 xl:px-14">
            <div className="mx-auto w-full max-w-xl space-y-8">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 antialiased bg-transparent">
                  Create your account
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Or{" "}
                  <Link
                    href={`/login${params?.get("next") ? `?next=${encodeURIComponent(params.get("next") as string)}` : ""}`}
                    className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:text-teal-800"
                  >
                    sign in to your existing account
                  </Link>
                </p>
              </div>
              <RegisterForm />
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center border-t border-slate-100 bg-slate-50/90 px-4 py-8 sm:px-6 lg:w-[min(54%,640px)] lg:border-l lg:border-t-0 lg:px-8 lg:py-10 xl:px-10">
            <AuthSideBanner variant="register" embedded />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
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
      <RegisterPageContent />
    </Suspense>
  );
}
