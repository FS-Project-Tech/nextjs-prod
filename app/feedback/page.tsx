//D:\stage-joya\nextjs-prod-main\app\feedback\page.tsx

import type { Metadata } from "next";
import { Suspense } from "react";
import FeedbackHubClient from "@/components/feedback/FeedbackHubClient";

const site = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Joya Medical Supplies";

export const metadata: Metadata = {
  title: "Feedback Form",
  description: `Send feedback to ${site} — prefilled survey or your own message.`,
  alternates: { canonical: "/feedback" },
};

function FeedbackHubFallback() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      <p className="mt-4 text-sm text-gray-500">Loading feedback…</p>
    </div>
  );
}

export default function FeedbackHubPage() {
  return (
    <Suspense fallback={<FeedbackHubFallback />}>
      <FeedbackHubClient />
    </Suspense>
  );
}
