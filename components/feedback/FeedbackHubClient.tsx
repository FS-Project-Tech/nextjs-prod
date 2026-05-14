//D:\stage-joya\nextjs-prod-main\components\feedback\FeedbackHubClient.tsx

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import FeedbackFreeformClient from "@/components/feedback/FeedbackFreeformClient";
import FeedbackPrefilledSurveyClient from "@/components/feedback/FeedbackPrefilledSurveyClient";

type FeedbackMode = "survey" | "freeform";

export default function FeedbackHubClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<FeedbackMode>("survey");

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "freeform") setMode("freeform");
    else setMode("survey");
  }, [searchParams]);

  const selectMode = useCallback(
    (next: FeedbackMode) => {
      setMode(next);
      const href = next === "freeform" ? `${pathname}?mode=freeform` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router]
  );

  const optionClass = (active: boolean) =>
    [
      "group flex flex-1 flex-col items-center justify-center rounded-2xl border-2 px-5 py-7 text-center transition-all duration-200 sm:px-8 sm:py-9",
      active
        ? "border-teal-600 bg-gradient-to-b from-teal-50/90 to-white shadow-md ring-2 ring-teal-600/15"
        : "cursor-pointer border-gray-200 bg-white shadow-sm hover:border-teal-400 hover:bg-gray-50/80 hover:shadow",
    ].join(" ");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Feedback Form
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:mx-0">
          Help us improve — choose a prefilled survey or write your own message.
        </p>
      </header>

      <div
        className="mt-10 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:gap-5"
        role="tablist"
        aria-label="Feedback type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "survey"}
          id="tab-prefilled"
          className={optionClass(mode === "survey")}
          onClick={() => selectMode("survey")}
        >
          <span className="text-lg font-semibold text-gray-900 sm:text-xl">Quick filled survey</span>
          <span className="mt-2 max-w-[14rem] text-sm leading-snug text-gray-600">
            Customer experience survey
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "freeform"}
          id="tab-freeform"
          className={optionClass(mode === "freeform")}
          onClick={() => selectMode("freeform")}
        >
          <span className="text-lg font-semibold text-gray-900 sm:text-xl">Write your own</span>
          <span className="mt-2 max-w-[14rem] text-sm leading-snug text-gray-600">
            Free-form message
          </span>
        </button>
      </div>

      <div
        className="mt-10 overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] sm:mt-12"
        role="tabpanel"
        aria-labelledby={mode === "survey" ? "tab-prefilled" : "tab-freeform"}
      >
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-5 py-4 sm:px-8 sm:py-5">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
            {mode === "survey" ? "Feedback — prefilled survey" : "Feedback — write your own"}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {mode === "survey"
              ? "Complete the questions below, then click Send."
              : "Enter your message below, then click Send."}
          </p>
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {mode === "survey" ? <FeedbackPrefilledSurveyClient /> : <FeedbackFreeformClient />}
        </div>
      </div>
    </div>
  );
}
