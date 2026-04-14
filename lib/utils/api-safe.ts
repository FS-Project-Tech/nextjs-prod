import { NextRequest, NextResponse } from "next/server";

type ErrorResponseOptions = {
  requestId: string;
  defaultMessage: string;
  fallbackBody?: Record<string, unknown>;
  logPrefix?: string;
};

function extractErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === "string") return e.code;
  if (typeof e.cause?.code === "string") return e.cause.code;
  return "";
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isUpstreamTransientError(error: unknown): boolean {
  const code = extractErrorCode(error).toUpperCase();
  if (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  const msg = extractErrorMessage(error).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("connect timeout") ||
    msg.includes("timed out") ||
    msg.includes("service unavailable")
  );
}

export function getRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id");
  return existing && existing.trim().length > 0 ? existing.trim() : crypto.randomUUID();
}

export function withRequestId<T>(response: NextResponse<T>, requestId: string): NextResponse<T> {
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export function createApiErrorResponse(
  error: unknown,
  options: ErrorResponseOptions
): NextResponse<Record<string, unknown>> {
  const { requestId, defaultMessage, fallbackBody = {}, logPrefix = "api" } = options;
  const upstreamUnavailable = isUpstreamTransientError(error);
  const status = upstreamUnavailable ? 503 : 500;
  const message = upstreamUnavailable ? "Service temporarily unavailable. Please retry shortly." : defaultMessage;

  console.error(`[${logPrefix}]`, { requestId, status, error });

  return withRequestId(
    NextResponse.json(
      {
        error: message,
        requestId,
        ...fallbackBody,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(upstreamUnavailable ? { "Retry-After": "5" } : {}),
        },
      }
    ),
    requestId
  );
}
