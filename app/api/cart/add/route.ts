import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders } from "@/lib/cors";
import { secureResponse } from "@/lib/security-headers";
import { storeApiAddLineItem } from "@/lib/store-cart-sync";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, res);
}

type BulkMetaRow = { key: string; value: string | number };

/**
 * Normalize client `meta_data` (or missing bulk) into stable bulk UOM rows + cart_item_data for Woo.
 */
function resolveBulkMetaData(raw: unknown): {
  meta_data: BulkMetaRow[];
  cart_item_data: Record<string, string | number>;
} {
  let bulk_uom = "";
  let bulk_multiplier = 1;

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (row == null || typeof row !== "object") continue;
      const k = String((row as { key?: unknown }).key ?? "").trim();
      const v = (row as { value?: unknown }).value;
      if (k === "bulk_uom") {
        bulk_uom = String(v ?? "").trim().slice(0, 200);
      }
      if (k === "bulk_multiplier") {
        const n = Math.floor(Number(v));
        if (Number.isFinite(n) && n >= 1) {
          bulk_multiplier = Math.min(99999, n);
        }
      }
    }
  }

  const meta_data: BulkMetaRow[] = [
    { key: "bulk_uom", value: bulk_uom },
    { key: "bulk_multiplier", value: bulk_multiplier },
  ];

  return {
    meta_data,
    cart_item_data: {
      bulk_uom,
      bulk_multiplier,
    },
  };
}

function parseAttributesRecord(raw: unknown): Record<string, string> | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.trim()) continue;
    const s = String(v ?? "").trim();
    if (s) out[k] = s;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type AddCartBody = {
  product_id?: unknown;
  variation_id?: unknown;
  quantity?: unknown;
  meta_data?: unknown;
  /** Optional `{ "Color": "Red", ... }` for Store API `variation` on variable products. */
  attributes?: unknown;
};

/**
 * POST /api/cart/add
 *
 * JSON body:
 * {
 *   "product_id": 123,
 *   "variation_id": 456 | optional (variable),
 *   "quantity": 1,
 *   "meta_data": [
 *     { "key": "bulk_uom", "value": "10 Box" },
 *     { "key": "bulk_multiplier", "value": 10 }
 *   ]
 * }
 *
 * If `meta_data` is omitted or incomplete, defaults to `bulk_uom: ""` and `bulk_multiplier: 1`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as AddCartBody;

    const productId = Number(body.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return applyCorsHeaders(
        req,
        secureResponse({ error: "product_id is required and must be a positive number" }, { status: 400 }),
      );
    }

    const variationRaw = body.variation_id;
    const variationId =
      variationRaw != null && variationRaw !== ""
        ? Number(variationRaw)
        : NaN;
    const hasVariation = Number.isFinite(variationId) && variationId > 0;

    const qtyRaw = body.quantity;
    const quantity =
      qtyRaw == null || qtyRaw === ""
        ? 1
        : Math.floor(Number(qtyRaw));
    if (!Number.isFinite(quantity) || quantity < 1) {
      return applyCorsHeaders(
        req,
        secureResponse({ error: "quantity must be an integer >= 1" }, { status: 400 }),
      );
    }

    const { meta_data, cart_item_data } = resolveBulkMetaData(body.meta_data);

    const addId = hasVariation ? variationId : productId;

    const result = await storeApiAddLineItem(req, {
      id: addId,
      product_id: productId,
      variation_id: hasVariation ? variationId : undefined,
      quantity,
      attributes: parseAttributesRecord(body.attributes),
      cart_item_data,
      meta_data,
    });

    if (result.ok === false) {
      return applyCorsHeaders(
        req,
        secureResponse(
          {
            error: "Failed to add item to WooCommerce cart",
            status: result.status,
            body: result.body,
          },
          { status: result.status >= 400 ? result.status : 502 },
        ),
      );
    }

    return applyCorsHeaders(
      req,
      secureResponse({
        success: true,
        meta_data,
        cart: result.cart,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Add to cart failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cart/add]", e);
    }
    return applyCorsHeaders(req, secureResponse({ error: message }, { status: 500 }));
  }
}
