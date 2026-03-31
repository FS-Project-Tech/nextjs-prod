"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import axios from 'axios';
import { useToast } from '@/components/ToastProvider';
import Link from 'next/link';

const forgotSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
});

type ForgotFormData = yup.InferType<typeof forgotSchema>;

export default function ForgotForm() {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: yupResolver(forgotSchema) as any,
  });

  const onSubmit = async (data: ForgotFormData) => {
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot', data);
      setSubmitted(true);
      success('If an account exists with this email, a password reset link has been sent.');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'An error occurred. Please try again.';
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Check your email</h3>
        <p className="text-sm text-gray-600">
          If an account exists with this email, we've sent you a password reset link.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium text-teal-600 hover:text-teal-500"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          {...register('email')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Enter your email address"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending...' : 'Send reset link'}
      </button>

      <div className="text-center text-sm">
        <Link href="/login" className="font-medium text-teal-600 hover:text-teal-500">
          Back to login
        </Link>
      </div>
    </form>
  );
}

