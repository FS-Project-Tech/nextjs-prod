import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqualUtf8 } from "@/lib/timing-safe";

/**
 * Protects internal performance routes. Set INTERNAL_PERFORMANCE_API_KEY and send `x-api-key` header.
 */
export function requirePerformanceApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_PERFORMANCE_API_KEY?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    return null;
  }

  const provided =
    req.headers.get("x-api-key")?.trim() ||
    req.headers.get("X-API-Key")?.trim() ||
    "";

  if (!provided || !timingSafeEqualUtf8(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
