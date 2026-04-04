import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, getUserData } from "@/lib/auth-server";
import { fetchProductReviews, createProductReview } from "@/lib/woocommerce";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const per_page = Math.min(50, Math.max(1, parseInt(searchParams.get("per_page") || "10", 10)));
    const reviews = await fetchProductReviews(productId, { page, per_page });
    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("Error fetching product reviews:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json({ error: "Please log in to add a review." }, { status: 401 });
    }
    const user = await getUserData(token);
    if (!user || !user.email) {
      return NextResponse.json({ error: "Please log in to add a review." }, { status: 401 });
    }
    const { id } = await params;
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }
    const body = await request.json();
    const review = typeof body.review === "string" ? body.review.trim() : "";
    let rating =
      typeof body.rating === "number" ? body.rating : parseInt(String(body.rating || "0"), 10);
    if (Number.isNaN(rating) || rating < 1) rating = 1;
    if (rating > 5) rating = 5;
    if (!review) {
      return NextResponse.json({ error: "Review text is required." }, { status: 400 });
    }
    const reviewer = user.name || user.username || user.email || "Guest";
    const reviewer_email = user.email || "guest@noreply.local";
    const result = await createProductReview(productId, {
      reviewer,
      reviewer_email,
      review,
      rating,
    });
    if (!result.created) {
      const message = result.error || "Failed to submit review.";
      const status =
        message.toLowerCase().includes("rest_") || message.toLowerCase().includes("permission")
          ? 403
          : 500;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ review: result.created });
  } catch (error) {
    console.error("Error creating product review:", error);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
