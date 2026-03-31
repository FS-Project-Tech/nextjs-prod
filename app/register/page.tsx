"use client";

import { useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import RegisterForm from '@/components/auth/RegisterForm';
import { useAuth } from '@/contexts/AuthContext';

function RegisterPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      const nextParam = params?.get('next');
      router.replace(nextParam || '/account');
    }
  }, [status, user, params, router]);

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Or{' '}
              <Link
                href={`/login${params?.get('next') ? `?next=${encodeURIComponent(params.get('next') as string)}` : ''}`}
                className="font-medium text-teal-600 hover:text-teal-500"
              >
                sign in to your existing account
              </Link>
            </p>
          </div>
          <div className="bg-white py-8">
            <RegisterForm />
          </div>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="hidden lg:block lg:w-1/2 relative bg-gradient-to-br from-teal-500 to-teal-700">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <h3 className="text-4xl font-bold mb-4">Join Us Today</h3>
            <p className="text-xl opacity-90">
              Create an account to start shopping and enjoy exclusive benefits
            </p>
          </div>
        </div>
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 translate-y-1/2"></div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <RegisterPageContent />
    </Suspense>
  );
}

