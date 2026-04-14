import { NextRequest, NextResponse } from "next/server";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { getPublicHeaderData } from "@/lib/cms/public-header-data";

const CACHE_HEADER = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

async function getHeaderData(_req: NextRequest) {
  const data = await getPublicHeaderData();
  return NextResponse.json(data, { headers: CACHE_HEADER });
}

export const GET = createPublicApiHandler(getHeaderData, {
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["GET"],
});
