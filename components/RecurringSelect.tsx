"use client";

export type RecurringPlan = "none" | "7" | "14" | "30";

interface RecurringSelectProps {
  onChange: (plan: RecurringPlan) => void;
  value?: RecurringPlan;
}

export default function RecurringSelect({ onChange, value = "none" }: RecurringSelectProps) {
  const plans: Array<{ value: RecurringPlan; label: string; description: string }> = [
    { value: "none", label: "One-time delivery", description: "Single purchase" },
    { value: "14", label: "Every 14 days", description: "Bi-weekly subscription" },
    { value: "30", label: "Every month", description: "Monthly subscription" },
  ];

  return (
    <div className="space-y-2" suppressHydrationWarning>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery Plan</label>
      <div className="flex flex-wrap gap-2">
        {plans.map((plan) => {
          const isSelected = value === plan.value;
          return (
            <button
              key={plan.value}
              type="button"
              onClick={() => onChange(plan.value)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? "border-black bg-black text-white"
                  : "border-black bg-transparent text-black hover:bg-gray-50"
              }`}
            >
              {plan.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
