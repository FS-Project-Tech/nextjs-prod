// /app/api/price/route.ts
export async function POST(req: Request) {
    const body = await req.json();
  
    const { product_id, variation_id, quantity, unit_option } = body;
  
    // 🔥 Fetch real price from Woo
    // Apply your ACF / UOM / discount logic HERE
  
    const basePrice = 100; // example
    const multiplier = unit_option ? parseInt(unit_option.match(/\d+/)?.[0] || "1") : 1;
  
    const finalPrice = basePrice * multiplier;
  
    return Response.json({
      unit_price: finalPrice,
      total: finalPrice * quantity,
    });
  }