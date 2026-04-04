import { NextResponse } from "next/server";
import { fetchLoginRegisterBanner } from "@/lib/login-register-banner";

/**
 * GET /api/cms/login-register-banner
 * Public JSON for login/register side panel (ACF Options).
 */
export async function GET() {
  try {
    const data = await fetchLoginRegisterBanner();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json({ imageUrl: null, linkUrl: null, fromCms: false }, { status: 200 });
  }
}
