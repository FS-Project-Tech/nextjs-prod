"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatPriceWithLabel } from "@/lib/format-utils";

const COUPON_CODE = "EMPOWER";
const DISCOUNT_PERCENT = 10;

interface EmpowerCampaignBoxProps {
  price: string | number;
  taxClass?: string;
  taxStatus?: string;
}

export default function EmpowerCampaignBox({
  price,
  taxClass,
  taxStatus,
}: EmpowerCampaignBoxProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rawPrice = Number(price) || 0;

  const discountedPrice =
    rawPrice > 0 ? Number((rawPrice * (1 - DISCOUNT_PERCENT / 100)).toFixed(2)) : 0;

  const checkStatus = async (e: string) => {
    if (!e?.trim()) return;
    try {
      const res = await fetch(`/api/empower/join?email=${encodeURIComponent(e.trim())}`);
      const data = await res.json();
      if (data.joined) setJoined(true);
    } catch {}
  };

  const handleJoin = async () => {
    const trimmed = email.trim();

    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/empower/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join.");
        return;
      }

      setJoined(true);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(COUPON_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const priceInfo = rawPrice > 0 ? formatPriceWithLabel(rawPrice, taxClass, taxStatus) : null;

  const discountedInfo =
    discountedPrice > 0 ? formatPriceWithLabel(discountedPrice, taxClass, taxStatus) : null;

  return (
    <div className="overflow-hidden rounded-xl text-white" style={{ background: "#1F605F" }}>
      <div className="p-3 sm:p-3 space-y-2">
        {/* Header */}
        <div className="text-center space-y-0.5">
          <h3 className="text-base font-bold">
            Join the EMPOWER campaign for exclusive discounts!
          </h3>
          <p className="text-xs text-white/90">
            You can purchase this product with a 10% discount.
          </p>
        </div>

        {!joined ? (
          <>
            {/* Email */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email.trim() && checkStatus(email)}
              placeholder="Enter your email"
              className="w-full rounded-lg border-0 bg-white px-4 py-2 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50"
              disabled={loading}
            />

            {/* Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleJoin}
                disabled={loading}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
              >
                {loading ? "Joining..." : "Join Now"}
              </button>
            </div>

            {error && <p className="text-center text-xs text-red-200">{error}</p>}
          </>
        ) : (
          <div className="space-y-2">
            {/* Joined text */}
            <p className="text-center text-xs font-medium text-white/95">
              You are already part of the campaign!
            </p>

            {/* Price */}
            {rawPrice > 0 && discountedPrice > 0 && (
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-gray-500 line-through text-sm">
                  {priceInfo?.price ?? `$${rawPrice.toFixed(2)}`}
                </span>

                <span className="text-lg font-bold text-orange-400">
                  {discountedInfo?.price ?? `$${discountedPrice.toFixed(2)}`}
                </span>
              </div>
            )}

            {/* Coupon box */}
            <div className="rounded-lg bg-white/10 px-3 py-1 space-y-1">
              <p className="text-xs font-medium text-white/90">Coupon Code:</p>

              <div className="flex items-center gap-2">
                <span className="flex-1 rounded border-2 border-dashed border-white/40 px-3 py-1 text-sm font-bold text-gray-900 bg-white/90">
                  {COUPON_CODE}
                </span>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1 text-sm font-medium text-white hover:bg-purple-700"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
