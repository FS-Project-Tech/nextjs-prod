import { NextResponse } from "next/server";

export type ApiErrorBody = {
  error: string;
  code: string;
  message: string;
  details?: unknown;
};

export function jsonApiError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  const body: ApiErrorBody = { error: message, code, message };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}
