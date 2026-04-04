import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function zodFail(err: unknown) {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const firstDetail = first
      ? `${first.path.join(".") || "request"}: ${first.message}`
      : "Validation error";
    return {
      success: false as const,
      message: "Validation error",
      error: firstDetail,
      code: "VALIDATION_ERROR" as const,
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  return null;
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...(extra || {}) }, { status });
}
