export default function ServiceFeatures() {
  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M9 14h6" />
          <path d="M13 10l2 2 4-4" strokeWidth="2" />
        </svg>
      ),
      label: "NDIS Payment option",
      description: "Claim-friendly"
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
          <path d="M3 14v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2M21 14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2" />
          <circle cx="7" cy="16" r="2" />
          <circle cx="17" cy="16" r="2" />
        </svg>
      ),
      label: "24/7 Customer Support",
      description: "Here to help"
    },
  ];

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex flex-1 items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              {feature.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{feature.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

