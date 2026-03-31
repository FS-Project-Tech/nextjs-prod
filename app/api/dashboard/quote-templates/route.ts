import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import {
  storeTemplate,
  fetchUserTemplates,
  deleteTemplate,
  updateTemplate,
} from '@/lib/quote-template-storage';
import type { QuoteTemplatePayload } from '@/lib/types/quote-template';

/**
 * GET /api/dashboard/quote-templates
 * Fetch all templates for the logged-in user
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user || !user.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const templates = await fetchUserTemplates(user.email);

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error: any) {
    console.error('Fetch templates error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/quote-templates
 * Create a new template
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user || !user.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name, description, items, shipping_method, notes, is_default } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Template must contain at least one item' },
        { status: 400 }
      );
    }

    const payload: QuoteTemplatePayload = {
      name: name.trim(),
      description: description?.trim(),
      items,
      shipping_method,
      notes: notes?.trim(),
      is_default: is_default || false,
    };

    const template = await storeTemplate(
      payload,
      user.email,
      user.id
    );

    if (!template) {
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template,
      message: 'Template created successfully',
    });
  } catch (error: any) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create template' },
      { status: 500 }
    );
  }
}

