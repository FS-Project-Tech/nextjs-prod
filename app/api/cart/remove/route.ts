import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders } from "@/lib/cors";
import { secureResponse } from "@/lib/security-headers";
import { removeLineFromStoreApi } from "@/lib/store-cart-sync";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, res);
}

type RemoveBody = {
  key?: unknown;
  productId?: unknown;
  variationId?: unknown;
};

/**
 * POST /api/cart/remove
 * Body: { key?, productId?, variationId? }
 * Removes one line from the Woo Store API cart, then returns the raw Store cart.
 * The client merges with `enrichClientCartFromStore(getActiveCartSnapshot(), storeCart)` so rapid removes stay consistent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as RemoveBody;
    const key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : undefined;
    const productId = Number(body.productId);
    const variationRaw = body.variationId;
    const variationId =
      variationRaw != null && variationRaw !== "" ? Number(variationRaw) : undefined;

    const after = await removeLineFromStoreApi(req, {
      key,
      productId: Number.isFinite(productId) && productId > 0 ? productId : undefined,
      variationId: variationId != null && Number.isFinite(variationId) && variationId > 0 ? variationId : undefined,
    });

    if (process.env.NODE_ENV === "development") {
      const n = Array.isArray(after.items) ? after.items.length : 0;
      console.log("[api/cart/remove] Woo cart after removal, line count:", n, after);
    }

    return applyCorsHeaders(req, secureResponse({ success: true, storeCart: after }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Remove cart line failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/remove]", e);
    }
    return applyCorsHeaders(req, secureResponse({ error: message }, { status: 500 }));
  }
}

/**
 * DELETE /api/cart/remove?key=...
 * Removes by Store API line key; returns raw Store cart JSON for client-side merge.
 */
export async function DELETE(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key")?.trim();
    if (!key) {
      return applyCorsHeaders(
        req,
        secureResponse({ error: "Missing key query parameter" }, { status: 400 }),
      );
    }

    const after = await removeLineFromStoreApi(req, { key });

    if (process.env.NODE_ENV === "development") {
      const n = Array.isArray(after.items) ? after.items.length : 0;
      console.log("[api/cart/remove] DELETE Woo cart after removal, line count:", n, after);
    }

    return applyCorsHeaders(req, secureResponse({ success: true, storeCart: after }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Remove cart line failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/remove] DELETE", e);
    }
    return applyCorsHeaders(req, secureResponse({ error: message }, { status: 500 }));
  }
}
