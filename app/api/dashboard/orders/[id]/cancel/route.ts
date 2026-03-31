import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-server';
import wcAPI from '@/lib/woocommerce';

/**
 * POST /api/dashboard/orders/[id]/cancel
 * Cancel an order (sync with WooCommerce)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const orderId = resolvedParams.id;

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Verify the order belongs to the authenticated user
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json(
        { error: 'WordPress URL not configured' },
        { status: 500 }
      );
    }

    // Get user data
    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!userResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get user data' },
        { status: 401 }
      );
    }

    const user = await userResponse.json();

    // Get the order to verify ownership
    let order;
    try {
      const orderResponse = await wcAPI.get(`/orders/${orderId}`);
      order = orderResponse.data;
    } catch (error) {
      const axiosLike = error as { response?: { status?: number } };
      if (axiosLike.response?.status === 404) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    // Verify order belongs to user
    const orderEmail = order.billing?.email || order.customer_id;
    const userEmail = user.email;
    const customerId = order.customer_id;

    // Get WooCommerce customer ID for comparison using optimized approach
    const { getCustomerIdWithFallback } = await import('@/lib/customer-utils');
    const wcCustomerId = await getCustomerIdWithFallback(userEmail, token);

    const isOwner = 
      orderEmail === userEmail || 
      customerId === user.id || 
      customerId === wcCustomerId;

    if (!isOwner) {
      return NextResponse.json(
        { error: 'You do not have permission to cancel this order' },
        { status: 403 }
      );
    }

    // Check if order can be cancelled (only processing or pending orders)
    if (order.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This order is already cancelled' },
        { status: 400 }
      );
    }

    if (order.status === 'completed' || order.status === 'refunded') {
      return NextResponse.json(
        { error: 'This order cannot be cancelled. Please contact support for assistance.' },
        { status: 400 }
      );
    }

    // Cancel the order in WooCommerce
    try {
      const updateResponse = await wcAPI.put(`/orders/${orderId}`, {
        status: 'cancelled',
      });

      return NextResponse.json({
        success: true,
        order: updateResponse.data,
        message: 'Order cancelled successfully',
      });
    } catch (error) {
      const axiosLike = error as { response?: { data?: { message?: string }; status?: number } };
      console.error('Error cancelling order:', error);
      return NextResponse.json(
        { error: axiosLike.response?.data?.message || 'Failed to cancel order' },
        { status: axiosLike.response?.status || 500 }
      );
    }
  } catch (error) {
    console.error('Cancel order API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while cancelling the order' },
      { status: 500 }
    );
  }
}

