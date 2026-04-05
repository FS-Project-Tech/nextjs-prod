import type { Metadata } from "next";
import CreditApplicationForm from "@/components/CreditApplicationForm";

const site = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Joya Medical Supplies";

export const metadata: Metadata = {
  title: "Credit Application",
  description: `Apply for a trade credit account with ${site}.`,
  alternates: { canonical: "/credit-application" },
};

export default function CreditApplicationPage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <div className="relative border-b border-gray-200/80 bg-white">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_120%_at_50%_-40%,rgba(13,148,136,0.12),transparent_55%)]"
          aria-hidden
        />
        <div className="relative container mx-auto max-w-8xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            Trade accounts
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Credit application
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            Complete all required fields. Our team will review your application and respond as soon as
            possible.
          </p>
        </div>
      </div>
      <div className="container mx-auto max-w-8xl px-4 py-8 sm:px-6 sm:py-10">
        <CreditApplicationForm />
      </div>
    </div>
  );
}
