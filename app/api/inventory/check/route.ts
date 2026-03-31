import { NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";

/**
 * Check inventory/stock status for products
 * Real-time stock validation
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items } = body; // Array of { productId, variationId?, quantity }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    const stockStatus = await Promise.all(
      items.map(async (item: { productId: number; variationId?: number; quantity: number }) => {
        try {
          const endpoint = item.variationId
            ? `/products/${item.productId}/variations/${item.variationId}`
            : `/products/${item.productId}`;

          const response = await wcAPI.get(endpoint, {
            params: {
              _fields: 'id,stock_status,stock_quantity,manage_stock,backorders_allowed,purchasable',
            },
          });
          const product = response.data;

          const available = 
            product.stock_status === 'instock' ||
            (product.stock_quantity !== null && 
             product.stock_quantity > 0) ||
            (product.backorders_allowed && product.stock_status === 'onbackorder');

          const quantityAvailable = product.manage_stock && product.stock_quantity !== null
            ? product.stock_quantity
            : product.stock_status === 'instock' ? 999 : 0;

          const canPurchase = product.purchasable && available && 
            (quantityAvailable >= item.quantity || product.backorders_allowed);

          return {
            productId: item.productId,
            variationId: item.variationId,
            requestedQuantity: item.quantity,
            available,
            quantityAvailable,
            stockStatus: product.stock_status,
            canPurchase,
            backordersAllowed: product.backorders_allowed,
          };
        } catch (error) {
          console.error(`Stock check error for product ${item.productId}:`, error);
          return {
            productId: item.productId,
            variationId: item.variationId,
            requestedQuantity: item.quantity,
            available: false,
            quantityAvailable: 0,
            stockStatus: 'unknown',
            canPurchase: false,
            error: (error instanceof Error ? error.message : 'An error occurred') || 'Failed to check stock',
          };
        }
      })
    );

    return NextResponse.json({
      items: stockStatus,
      allAvailable: stockStatus.every((item) => item.canPurchase),
    });
  } catch (error) {
    console.error("Inventory check error:", error);
    const message = error instanceof Error ? error.message : 'Failed to check inventory';
    return NextResponse.json(
      { 
        error: "Failed to check inventory",
        details: message 
      },
      { status: 500 }
    );
  }
}


