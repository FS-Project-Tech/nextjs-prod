import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqualString, readBearerToken } from "@/lib/constant-time-node";
import { getClientIp } from "@/lib/rate-limit";
import { logInvalidAuth } from "@/lib/api-logging";

export const runtime = "nodejs";

function normalizeHost(raw: string): string {
  return String(raw || "").replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
}

function typesenseHostAndKey(): { host: string; apiKey: string; collection: string } {
  const host = normalizeHost(process.env.TYPESENSE_HOST || process.env.NEXT_PUBLIC_TYPESENSE_HOST || "");
  const apiKey = String(
    process.env.TYPESENSE_ADMIN_API_KEY || process.env.TYPESENSE_API_KEY || ""
  ).trim();
  const collection = String(
    process.env.TYPESENSE_COLLECTION || process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION || "products_updated"
  ).trim();
  if (!host || !apiKey) {
    throw new Error("Typesense write credentials are not configured.");
  }
  return { host, apiKey, collection };
}

function wpFeedBase(): string {
  const base = String(process.env.WP_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("WP_URL is not configured.");
  return `${base}/wp-json/custom/v1/typesense-products`;
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.TYPESENSE_SYNC_SECRET?.trim() || process.env.SYNC_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { error: "Sync is not configured", code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    const presented = readBearerToken(req);
    if (!presented || !constantTimeEqualString(secret, presented)) {
      logInvalidAuth("/api/typesense/search/sync", getClientIp(req), "invalid_bearer");
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await req.json()) as { product_id?: unknown };
    const productId = Number(body?.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product_id", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const feedSecret = process.env.TYPESENSE_FEED_SECRET?.trim();
    const feedUrl = new URL(wpFeedBase());
    feedUrl.searchParams.set("product_id", String(productId));
    if (feedSecret) {
      // Keep compatibility with WP setups where Authorization may be stripped.
      feedUrl.searchParams.set("secret", feedSecret);
    }

    const feedRes = await fetch(feedUrl.toString(), {
      cache: "no-store",
      headers: feedSecret ? { Authorization: `Bearer ${feedSecret}` } : undefined,
    });
    if (!feedRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch WP typesense feed", code: "WP_FEED_ERROR" },
        { status: 502 }
      );
    }
    const products = (await feedRes.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(products)) {
      return NextResponse.json(
        { error: "Invalid feed format", code: "WP_FEED_INVALID" },
        { status: 502 }
      );
    }

    // Sync parent + all related variations in one request.
    const wanted = products.filter((p) => {
      const id = Number(p.id ?? 0);
      const parent = Number(p.parent_id ?? 0);
      return id === productId || parent === productId;
    });

    if (wanted.length === 0) {
      return NextResponse.json({ error: "Product not found in feed" }, { status: 404 });
    }

    const { host, apiKey, collection } = typesenseHostAndKey();
    const importRes = await fetch(
      `https://${host}/collections/${encodeURIComponent(collection)}/documents/import?action=upsert`,
      {
        method: "POST",
        headers: {
          "X-TYPESENSE-API-KEY": apiKey,  
          "Content-Type": "text/plain",
        },
        body: wanted.map((d) => JSON.stringify(d)).join("\n"),
      }
    );

    const importText = await importRes.text();
    if (!importRes.ok) {
      return NextResponse.json(
        { error: "Typesense import failed", details: importText },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      synced: wanted.length,
      data: importText,
    });
  } catch (err) {
    console.error("[typesense/sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}



