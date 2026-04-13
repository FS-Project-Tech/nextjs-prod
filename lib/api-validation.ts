import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema, ZodError } from "zod";
import { jsonApiError } from "@/lib/api-errors";

export type ParseJsonResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export function formatZodError(err: ZodError): Record<string, unknown> {
  return err.flatten();
}

export async function parseJsonBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<ParseJsonResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonApiError(400, "INVALID_JSON", "Expected a JSON body."),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid request body.",
        formatZodError(parsed.error)
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
