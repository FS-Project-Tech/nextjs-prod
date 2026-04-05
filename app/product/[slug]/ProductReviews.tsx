"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { sanitizeReview } from "@/lib/xss-sanitizer";

const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

export interface ReviewItem {
  id: number;
  date_created: string;
  reviewer: string;
  reviewer_email?: string;
  review: string;
  rating: number;
  verified?: boolean;
}

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div
      className="flex items-center gap-0.5 text-amber-400"
      role="img"
      aria-label={`Rated ${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`${sizeClass} shrink-0 ${i <= value ? "fill-current" : "fill-gray-200"}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </div>
  );
}

function formatReviewDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/** Show display name only; never show email. Use reviewer name or, if it looks like email, the part before @. */
function getReviewerDisplayName(reviewer: string | undefined): string {
  if (!reviewer || !reviewer.trim()) return "Reviewer";
  const trimmed = reviewer.trim();
  if (trimmed.includes("@")) {
    const beforeAt = trimmed.split("@")[0];
    return beforeAt && beforeAt.length > 0 ? beforeAt : "Reviewer";
  }
  return trimmed;
}

interface ProductReviewsProps {
  productId: number;
  averageRating: string;
  ratingCount: number;
  reviewsAllowed: boolean;
  initialReviews: ReviewItem[];
}

export default function ProductReviews({
  productId,
  averageRating,
  ratingCount,
  reviewsAllowed,
  initialReviews,
}: ProductReviewsProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isLoggedIn = status === "authenticated" && !!session?.user;
  const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
  const [hoverRating, setHoverRating] = useState(0);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const refetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/reviews?per_page=20`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews ?? []);
      }
    } catch {
      // keep current reviews
    }
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);
    if (!reviewsAllowed) return;
    if (!reviewText.trim()) {
      setSubmitMessage({ type: "error", text: "Please enter your review." });
      return;
    }
    const ratingToSend = rating >= 1 && rating <= 5 ? rating : 5;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review: reviewText.trim(),
          rating: ratingToSend,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = data.error || "Failed to submit review.";
        if (res.status === 401) {
          setSubmitMessage({ type: "error", text: "Please log in to add a review." });
          return;
        }
        const isGuestBlocked =
          typeof raw === "string" &&
          (raw.toLowerCase().includes("logged in") ||
            raw.toLowerCase().includes("rest_cannot") ||
            raw.toLowerCase().includes("permission") ||
            raw.toLowerCase().includes("not allow"));
        const text = isGuestBlocked
          ? "Your store may only allow logged-in users to leave reviews. Please sign in to submit a review, or ask the store owner to enable guest reviews."
          : raw;
        setSubmitMessage({ type: "error", text });
        return;
      }
      setSubmitMessage({ type: "success", text: "Thank you! Your review has been submitted." });
      setRating(0);
      setReviewText("");
      await refetchReviews();
    } catch {
      setSubmitMessage({ type: "error", text: "Failed to submit review. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const productAvg = parseFloat(averageRating || "0") || 0;
  const productCount = ratingCount || 0;
  const hasReviewsFromList = reviews.length > 0;
  const displayRating = hasReviewsFromList
    ? Math.max(
        0,
        Math.min(
          5,
          Math.round((reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length) * 2) / 2
        )
      )
    : Math.max(0, Math.min(5, Math.round(productAvg * 2) / 2));
  const displayCount = hasReviewsFromList ? reviews.length : productCount;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <h3 className="text-base font-semibold text-gray-900 sm:text-lg">Reviews</h3>

      {/* Summary */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <StarRating rating={displayRating} size="md" />
          <span className="text-sm font-medium text-gray-700">
            {displayRating.toFixed(1)} out of 5
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {displayCount === 0
            ? "No reviews yet"
            : `${displayCount} ${displayCount === 1 ? "review" : "reviews"}`}
        </span>
      </div>

      {/* List - show up to ~3 reviews before scrolling */}
      <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
        {reviews.length === 0 ? (
          <li className="rounded-lg bg-gray-50 px-4 py-4 text-center text-sm text-gray-500">
            No reviews yet. Be the first to review this product.
          </li>
        ) : (
          reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {getReviewerDisplayName(r.reviewer)}
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <StarRating rating={r.rating} size="sm" />
                  <time dateTime={r.date_created}>{formatReviewDate(r.date_created)}</time>
                </div>
              </div>
              <div
                className="mt-1.5 text-sm text-gray-700 prose prose-sm max-w-none prose-p:my-0.5 prose-p:leading-snug"
                dangerouslySetInnerHTML={{
                  __html: sanitizeReview(r.review),
                }}
              />
            </li>
          ))
        )}
      </ul>

      {/* Add review: require login */}
      {reviewsAllowed && !isLoggedIn && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">Please log in to add a review for this product.</p>
          <Link
            href={`/login?next=${encodeURIComponent(pathname || "/")}`}
            className="mt-2 inline-block rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            Log in
          </Link>
        </div>
      )}
      {reviewsAllowed && isLoggedIn && (
        <form onSubmit={handleSubmit} className="mt-4 border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-900">Add a review</h4>

          {/* Your rating */}
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700">Your rating of this product</p>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                  className="focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 rounded"
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(value)}
                >
                  <svg
                    className={`h-8 w-8 shrink-0 transition-colors ${
                      value <= (hoverRating || rating)
                        ? "text-amber-400 fill-amber-400"
                        : "text-gray-500 fill-gray-500"
                    }`}
                    viewBox="0 0 20 20"
                  >
                    <path d={STAR_PATH} />
                  </svg>
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-500">
                {hoverRating || rating
                  ? `${hoverRating || rating} star${(hoverRating || rating) === 1 ? "" : "s"}`
                  : "Click to rate"}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="review-text" className="block text-sm font-medium text-gray-700">
              Your review
            </label>
            <textarea
              id="review-text"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="Share your experience with this product..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              required
            />
          </div>

          {submitMessage && (
            <p
              className={`mt-2 text-sm ${submitMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
              role="alert"
            >
              {submitMessage.text}
            </p>
          )}

          <div className="mt-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
