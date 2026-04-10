"use client";

function formatStatusLabel(status: string): string {
  const s = String(status || "").trim();
  if (!s) return "Unknown";
  return s
    .split(/[-_]/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function orderStatusBadgeClasses(status: string): string {
  const s = String(status || "").toLowerCase().trim();
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset";

  switch (s) {
    case "completed":
      return `${base} bg-emerald-50 text-emerald-800 ring-emerald-600/20`;
    case "processing":
      return `${base} bg-sky-50 text-sky-900 ring-sky-600/25`;
    case "pending":
    case "pending-payment":
      return `${base} bg-amber-50 text-amber-900 ring-amber-600/30`;
    case "on-hold":
      return `${base} bg-orange-50 text-orange-900 ring-orange-600/25`;
    case "cancelled":
    case "canceled":
      return `${base} bg-red-50 text-red-800 ring-red-600/20`;
    case "failed":
      return `${base} bg-rose-50 text-rose-900 ring-rose-700/30`;
    case "refunded":
    case "partially-refunded":
      return `${base} bg-violet-50 text-violet-900 ring-violet-600/25`;
    default:
      return `${base} bg-gray-100 text-gray-800 ring-gray-500/15`;
  }
}

export default function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={orderStatusBadgeClasses(status)}>{formatStatusLabel(status)}</span>
  );
}
