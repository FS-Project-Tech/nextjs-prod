import ClearancePageClient from "@/components/ClearancePageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clearance products (on sale)",
  description: "Special deals and discounted items. Browse all clearance and on-sale products.",
};

export default function ClearancePage() {
  return <ClearancePageClient />;
}
