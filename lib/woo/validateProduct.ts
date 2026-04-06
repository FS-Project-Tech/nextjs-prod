import { wcGet } from "@/lib/woocommerce/wc-fetch";

export type WooProductValidation =
  | {
      ok: true;
      product: {
        id: number;
        type: string;
        status: string;
        purchasable: boolean;
        price: string;
      };
    }
  | {
      ok: false;
      error: {
        code:
          | "PRODUCT_NOT_FOUND"
          | "PRODUCT_NOT_PUBLISHED"
          | "PRODUCT_NOT_PURCHASABLE"
          | "PRODUCT_PRICE_MISSING"
          | "PRODUCT_INVALID";
        message: string;
      };
    };

export async function validateProduct(productId: number): Promise<WooProductValidation> {
  try {
    const { data: raw } = await wcGet<Record<string, unknown>>(
      `/products/${productId}`,
      undefined,
      "noStore",
    );
    const p = raw || {};

    const id = Number(p.id || 0);
    const type = String(p.type || "");
    const status = String(p.status || "");
    const purchasable = Boolean(p.purchasable);
    const price = String(p.price ?? "").trim();

    console.info("[woo] product_validation", {
      product_id: productId,
      found: id > 0,
      type,
      status,
      purchasable,
      price,
    });

    if (id <= 0) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_INVALID",
          message: `Product ${productId} is invalid in Woo response.`,
        },
      };
    }
    if (status !== "publish") {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_PUBLISHED",
          message: `Product ${productId} is not published.`,
        },
      };
    }
    if (!purchasable) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_PURCHASABLE",
          message: `Product ${productId} is not purchasable.`,
        },
      };
    }
    if (!price) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_PRICE_MISSING",
          message: `Product ${productId} has no price.`,
        },
      };
    }

    return {
      ok: true,
      product: {
        id,
        type,
        status,
        purchasable,
        price,
      },
    };
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    if (status === 404) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_FOUND",
          message:
            `Product ${productId} not found in Woo API environment ` +
            "(possible staging/prod mismatch).",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "PRODUCT_INVALID",
        message:
          typeof error?.message === "string"
            ? error.message
            : `Unable to validate product ${productId}.`,
      },
    };
  }
}

/** Validate a variable product’s variation (publish, purchasable, price). */
export async function validateVariation(
  parentId: number,
  variationId: number
): Promise<WooProductValidation> {
  try {
    const { data: raw } = await wcGet<Record<string, unknown>>(
      `/products/${parentId}/variations/${variationId}`,
      undefined,
      "noStore",
    );
    const v = raw || {};
    const id = Number(v.id || 0);
    const status = String(v.status || "");
    const purchasable = Boolean(v.purchasable);
    const price = String(v.price ?? "").trim();

    if (id <= 0) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_INVALID",
          message: `Variation ${variationId} under product ${parentId} is invalid.`,
        },
      };
    }
    if (status !== "publish") {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_PUBLISHED",
          message: `Variation ${variationId} is not published.`,
        },
      };
    }
    if (!purchasable) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_PURCHASABLE",
          message: `Variation ${variationId} is not purchasable.`,
        },
      };
    }
    if (!price) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_PRICE_MISSING",
          message: `Variation ${variationId} has no price.`,
        },
      };
    }

    return {
      ok: true,
      product: {
        id,
        type: "variation",
        status,
        purchasable,
        price,
      },
    };
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    if (status === 404) {
      return {
        ok: false,
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: `Variation ${variationId} not found for product ${parentId}.`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "PRODUCT_INVALID",
        message:
          typeof error?.message === "string"
            ? error.message
            : `Unable to validate variation ${variationId}.`,
      },
    };
  }
}
