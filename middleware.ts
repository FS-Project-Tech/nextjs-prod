import { proxy } from "@/lib/security-headers";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return proxy(request);
}

// Apply to all routes
export const config = {
  matcher: "/:path*",
};