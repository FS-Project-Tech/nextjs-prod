import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Health Professional | Coming Soon",
  description: "Health Professional resources and information – coming soon.",
};

export default function HealthProfessionalPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
      <span
        className="inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-white mb-4"
        style={{ backgroundColor: "var(--primary)" }}
      >
        Coming soon
      </span>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">
        Health Professional
      </h1>
      <p className="text-gray-600 text-center max-w-md mb-8">
        We are preparing dedicated content and resources for health professionals. Check back later.
      </p>
      <Link
        href="/shop"
        className="rounded-lg px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        style={{ backgroundColor: "var(--primary)" }}
      >
        Continue shopping
      </Link>
    </div>
  );
}
