import { NextRequest, NextResponse } from "next/server";
import Typesense from "typesense";
import { constantTimeEqualString, readBearerToken } from "@/lib/constant-time-node";
import { logInvalidAuth } from "@/lib/api-logging";
import { getClientIp } from "@/lib/rate-limit";
import { getTypesenseCollectionName } from "@/lib/typesenseClient";

export const runtime = "nodejs";

const client = new Typesense.Client({
  nodes: [
    {
      host: (process.env.TYPESENSE_HOST || process.env.NEXT_PUBLIC_TYPESENSE_HOST || "").replace(
        /^https?:\/\//,
        ""
      ),
      port: 443,
      protocol: "https",
    },
  ],
  apiKey: (process.env.TYPESENSE_ADMIN_API_KEY || process.env.TYPESENSE_API_KEY || "").trim(),
});

function isSafeDocumentId(id: string | null): id is string {
  if (!id || id.length > 256) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function DELETE(req: NextRequest) {
  const secret = process.env.TYPESENSE_DELETE_SECRET?.trim() || process.env.SYNC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Delete is not configured", code: "NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const presented = readBearerToken(req);
  if (!presented || !constantTimeEqualString(secret, presented)) {
    logInvalidAuth("/api/typesense/search/delete", getClientIp(req), "invalid_bearer");
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!isSafeDocumentId(id)) {
    return NextResponse.json(
      { error: "Invalid or missing id", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    await client.collections(getTypesenseCollectionName()).documents(id).delete();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[typesense/delete]", e);
    return NextResponse.json({ error: "Delete failed", code: "DELETE_FAILED" }, { status: 500 });
  }
}
