"use client";

import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Set new password</h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Enter your new password to complete your account recovery.
            </p>
          </div>
          <div className="bg-white py-8">
            <ResetPasswordForm />
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative bg-gradient-to-br from-teal-500 to-teal-700">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <h3 className="text-4xl font-bold mb-4">Reset Password</h3>
            <p className="text-xl opacity-90">Choose a strong new password and sign back in securely.</p>
          </div>
        </div>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white rounded-full translate-x-1/4 -translate-y-1/4"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full -translate-x-1/4 translate-y-1/4"></div>
        </div>
      </div>
    </div>
  );
}
