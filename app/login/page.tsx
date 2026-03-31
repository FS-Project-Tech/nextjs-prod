"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import { Shield } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/AuthProvider';
import { validateNextParam, ALLOWED_REDIRECT_PATHS } from '@/lib/redirectUtils';

/** Only show loading UI if the operation takes longer than this (ms). Fast loads show nothing. */
const SESSION_LOADING_DELAY_MS = 700;
const REDIRECT_LOADING_DELAY_MS = 400;

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, status } = useAuth();
  const [showSessionLoading, setShowSessionLoading] = useState(false);
  const [showRedirecting, setShowRedirecting] = useState(false);
  const sessionDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Secure redirect resolver
  const resolveRedirect = useCallback(() => {
    if (!params) return '/dashboard';
    const nextParam = params.get('next');
    return validateNextParam(nextParam, ALLOWED_REDIRECT_PATHS, '/dashboard');
  }, [params]);

  // ✅ Redirect authenticated users
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    router.replace(resolveRedirect());
  }, [status, user, resolveRedirect]);

  // ✅ Show "Checking session…" only if session check takes longer than delay (avoids flash when fast)
  useEffect(() => {
    if (status !== 'loading') {
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
    if (status !== 'authenticated' || !user) {
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
  if (status === 'loading' && showSessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600" aria-hidden />
        <p className="text-gray-600 text-sm">Loading…</p>
      </div>
    );
  }

  // ✅ Already authenticated: only show redirect message after delay
  if (status === 'authenticated' && user && showRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-600 text-sm">Redirecting to your account…</p>
      </div>
    );
  }

  // ✅ Login form UI
  return (
    <div className="h-screen flex overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome</h1>
            <p className="text-gray-600">Sign in to your account to continue</p>
          </div>

          {/* Login Form Card */}
          <div>
            <LoginForm />
          </div>

          {/* Additional Links */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                href="/register"
                className="font-semibold text-gray-900 hover:text-gray-700 transition-colors underline"
              >
                Create one now
              </Link>
            </p>
          </div>

          {/* Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Shield className="w-4 h-4" aria-hidden="true" />
            <span>Secure login with encrypted connection</span>
          </div>
        </div>
      </div>

      {/* Right side - Dynamic Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden h-full">
        <Image
          src="https://images.unsplash.com/photo-1556740758-90de374c12ad?w=800&h=1200&fit=crop&q=80"
          alt="Welcome"
          fill
          priority
          className="object-cover"
          sizes="50vw"
        />
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>

        {/* Optional: Add text overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-12 text-white">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold mb-3">Secure & Fast Access</h2>
            <p className="text-lg text-gray-200 leading-relaxed">
              Sign in to access your account and manage your orders and more
            </p>
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