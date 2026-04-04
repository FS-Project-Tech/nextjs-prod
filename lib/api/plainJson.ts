import { NextResponse } from "next/server";

export type PlainApiSuccess<T> = { success: true; data: T };
export type PlainApiFailure = { success: false; error: string };

export function plainJsonSuccess<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json({ success: true, data } satisfies PlainApiSuccess<T>, {
    status: init?.status ?? 200,
  });
}

export function plainJsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: message } satisfies PlainApiFailure, {
    status,
  });
}
