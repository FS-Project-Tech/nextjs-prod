"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useToast } from "@/components/ToastProvider";
// import { useAuth } from "@/components/AuthProvider";
import { signIn } from "next-auth/react";
import { validateNextParam, ALLOWED_REDIRECT_PATHS } from "@/lib/redirectUtils";
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Login form schema with Yup validation
 */
const loginSchema = yup.object({
  username: yup
    .string()
    .required("Email or username is required")
    .test("not-empty", "Email or username is required", (value) => {
      return value !== undefined && value !== null && String(value).trim().length > 0;
    })
    .test("email-format", "Invalid email format", function (value) {
      // Allow username or email
      if (!value) return true;
      const trimmed = String(value).trim();
      // If it contains @, validate as email
      if (trimmed.includes("@")) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      }
      // Otherwise, allow as username (min 3 chars)
      return trimmed.length >= 3;
    }),
  password: yup
    .string()
    .required("Password is required")
    .min(8, "Password must be at least 8 characters"),
  rememberMe: yup.boolean().default(false),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { error: showToastError, success: showToastSuccess } = useToast();
  // const { login: authLogin } = useAuth();

  // Get and validate next parameter securely
  // const nextParam = validateNextParam(params.get("next"), ALLOWED_REDIRECT_PATHS, '/my-account');
  const nextParam = validateNextParam(params.get("next"), ALLOWED_REDIRECT_PATHS, "/dashboard");

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isValid },
    watch,
    setError,
    clearErrors,
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema) as any,
    mode: "onChange", // Real-time validation
    reValidateMode: "onChange",
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  // Watch form values for real-time validation feedback
  const usernameValue = watch("username");
  const passwordValue = watch("password");

  const onSubmit = async (data: LoginFormData) => {
    setFormError(null);
    clearErrors();
    setIsSubmitting(true);
    setLoginSuccess(false);

    try {
      // Use AuthContext login which handles state updates and redirect
      // const result = await authLogin(
      //   data.username.trim(),
      //   data.password,
      //   nextParam // Pass the redirect URL
      // );

      // if (!result.success) {
      //   const errorMessage = result.error || "Unable to sign in. Please try again.";
      //   setFormError(errorMessage);
      //   setError("root", { message: errorMessage });
      //   showToastError(errorMessage);
      //   return;
      // }

      // // Success - AuthContext handles the redirect
      // setLoginSuccess(true);
      // showToastSuccess("Login successful! Redirecting...");

      const result = await signIn("credentials", {
        redirect: false, // handle redirect in the form
        username: data.username.trim(), // your WP username/email
        password: data.password,
        callbackUrl: nextParam, // where to go after login
      });

      if (!result || result.error) {
        const errorMessage = result?.error || "Unable to sign in. Please try again.";
        setFormError(errorMessage);
        setError("root", { message: errorMessage });
        showToastError(errorMessage);
        return;
      }

      // Login success: NextAuth session cookie is set
      setLoginSuccess(true);
      showToastSuccess("Login successful! Redirecting...");
      router.push(result.url || nextParam);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";

      setFormError(errorMessage);
      setError("root", { message: errorMessage });
      showToastError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-lg">
      {/* <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
        <p className="text-sm text-slate-500">
          Don’t have an account?{" "}
          <Link
            href={`/register?next=${encodeURIComponent(nextParam)}`}
            className="text-teal-600 font-medium hover:underline"
          >
            Create one
          </Link>
        </p>
      </div> */}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-live="polite" noValidate>
        {/* Username/Email Field */}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
            Email or Username
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail
                className={`h-5 w-5 ${
                  errors.username
                    ? "text-red-400"
                    : usernameValue
                      ? "text-teal-500"
                      : "text-slate-400"
                }`}
              />
            </div>
            <input
              id="username"
              type="text"
              {...register("username")}
              autoComplete="email"
              aria-invalid={!!errors.username}
              aria-describedby={errors.username ? "username-error" : undefined}
              className={`pl-10 mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                errors.username
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/40 bg-red-50"
                  : usernameValue && !errors.username
                    ? "border-teal-300 focus:border-teal-500 focus:ring-teal-500/40 bg-teal-50/30"
                    : "border-slate-300 focus:border-teal-500 focus:ring-teal-500/40"
              }`}
              placeholder="Enter your email or username"
            />
          </div>
          {errors.username && (
            <div
              id="username-error"
              className="mt-1.5 flex items-start gap-1.5 text-sm text-red-600"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errors.username.message}</span>
            </div>
          )}
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock
                className={`h-5 w-5 ${
                  errors.password
                    ? "text-red-400"
                    : passwordValue
                      ? "text-teal-500"
                      : "text-slate-400"
                }`}
              />
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              {...register("password")}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={`pl-10 pr-10 mt-1 w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                errors.password
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/40 bg-red-50"
                  : passwordValue && !errors.password
                    ? "border-teal-300 focus:border-teal-500 focus:ring-teal-500/40 bg-teal-50/30"
                    : "border-slate-300 focus:border-teal-500 focus:ring-teal-500/40"
              }`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && (
            <div
              id="password-error"
              className="mt-1.5 flex items-start gap-1.5 text-sm text-red-600"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errors.password.message}</span>
            </div>
          )}
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register("rememberMe")}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-slate-600">Remember me</span>
          </label>
          <Link
            href="/forgot"
            className="text-teal-600 hover:text-teal-700 hover:underline font-medium transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Success Message */}
        {loginSuccess && (
          <div
            className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              <p className="flex-1">Login successful! Redirecting...</p>
            </div>
          </div>
        )}

        {/* Form Error Message */}
        {(formError || errors.root) && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <p className="flex-1">{formError || errors.root?.message}</p>
            </div>
          </div>
        )}
        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || (!isValid && isDirty)}
          className={`flex w-full items-center justify-center rounded-md px-4 py-2.5 font-medium text-white shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            loginSuccess
              ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
              : formError || errors.root
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                : "bg-teal-600 hover:bg-teal-500 focus:ring-teal-500"
          } disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-current`}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing in…
            </span>
          ) : loginSuccess ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Success! Redirecting...
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="text-teal-500 hover:underline">
          Terms
        </Link>{" "}
        &{" "}
        <Link href="/legal/privacy" className="text-teal-500 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
