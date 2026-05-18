import { buildMachshipTrackingUrl } from "@/lib/machship/tracking";

type TrackOrderButtonProps = {
  trackingToken: string;
  className?: string;
  showToken?: boolean;
};

export default function TrackOrderButton({
  trackingToken,
  className = "",
  showToken = false,
}: TrackOrderButtonProps) {
  const href = buildMachshipTrackingUrl(trackingToken);

  return (
    <div className={`flex flex-col items-stretch gap-1 ${className}`.trim()}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-md border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
      >
        Track your order
      </a>
      {showToken ? (
        <p className="text-xs text-gray-500 break-all">
          Tracking ID: <span className="font-mono text-gray-700">{trackingToken}</span>
        </p>
      ) : null}
    </div>
  );
}
