import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { storeQuote, generateQuoteNumber } from '@/lib/quote-storage';
import { sendQuoteCreatedEmail } from '@/lib/quote-email';
import type { QuoteRequestPayload } from '@/lib/types/quote';

/**
 * POST /api/quote/request
 * Send quote request email to the logged-in user
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      email, 
      userName,
      items, 
      subtotal, 
      shipping, 
      shippingMethod,
      discount,
      total,
      notes // Add notes field
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Cart items are required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Generate unique quote number
    const quoteNumber = generateQuoteNumber();

    // Store quote in database
    const quotePayload: QuoteRequestPayload = {
      email,
      userName,
      items,
      subtotal,
      shipping,
      shippingMethod,
      discount,
      total,
      notes,
    };

    const storedQuote = await storeQuote(quotePayload, quoteNumber);

    if (!storedQuote) {
      console.error('Failed to store quote, but continuing with email...');
      // Continue with email even if storage fails
    }

    // Send email notification using the new email system
    if (storedQuote) {
      try {
        await sendQuoteCreatedEmail(storedQuote);
      } catch (emailError) {
        // Log but don't fail the request if email fails
        console.error('Failed to send quote created email:', emailError);
      }
    }

    // Return success with quote ID
    return NextResponse.json({ 
      success: true, 
      message: 'Quote request submitted successfully',
      quote_id: storedQuote?.id || quoteNumber,
      quote_number: quoteNumber,
    });

  } catch (error) {
    console.error('Quote request error:', error);
    return NextResponse.json(
      { error: 'Failed to process quote request. Please try again.' },
      { status: 500 }
    );
  }
}


