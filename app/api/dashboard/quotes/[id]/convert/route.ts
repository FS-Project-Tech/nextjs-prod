import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { getQuoteById } from '@/lib/quote-storage';
import { getCustomerIdWithFallback } from '@/lib/customer-utils';

/**
 * POST /api/dashboard/quotes/[id]/convert
 * Convert a quote to cart items (prepares for checkout)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const quoteId = params.id;
    if (!quoteId) {
      return NextResponse.json(
        { error: 'Quote ID is required' },
        { status: 400 }
      );
    }

    // Get customer ID using authenticated user
    const user = await getUserData(token);
    if (!user?.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const customerId = await getCustomerIdWithFallback(user.email, token);
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Fetch the quote
    const quote = await getQuoteById(quoteId, customerId);
    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Only allow conversion of accepted quotes
    if (quote.status !== 'accepted') {
      return NextResponse.json(
        { error: 'Only accepted quotes can be converted to orders' },
        { status: 400 }
      );
    }

    // Check if quote has expired
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This quote has expired' },
        { status: 400 }
      );
    }

    // Return quote items formatted for cart
    const cartItems = quote.items.map((item) => ({
      product_id: item.product_id || 0,
      variation_id: item.variation_id || undefined,
      name: item.name,
      sku: item.sku || undefined,
      price: String(item.price),
      quantity: item.qty,
      attributes: item.attributes || {},
      deliveryPlan: item.deliveryPlan || undefined,
    }));

    return NextResponse.json({
      success: true,
      quote_id: quoteId,
      quote_number: quote.quote_number,
      items: cartItems,
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      shipping_method: quote.shipping_method,
      discount: quote.discount,
      total: quote.total,
      notes: quote.notes,
    });
  } catch (error: any) {
    console.error('Error converting quote:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert quote' },
      { status: 500 }
    );
  }
}

