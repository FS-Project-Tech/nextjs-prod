import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import {
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from '@/lib/quote-template-storage';
import type { QuoteTemplatePayload } from '@/lib/types/quote-template';

/**
 * GET /api/dashboard/quote-templates/[id]
 * Get a single template by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const template = await getTemplateById(id, user.email);

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error: any) {
    console.error('Get template error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/dashboard/quote-templates/[id]
 * Update a template
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const updates: Partial<QuoteTemplatePayload> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Template name cannot be empty' },
          { status: 400 }
        );
      }
      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description?.trim();
    }

    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return NextResponse.json(
          { error: 'Template must contain at least one item' },
          { status: 400 }
        );
      }
      updates.items = body.items;
    }

    if (body.shipping_method !== undefined) {
      updates.shipping_method = body.shipping_method;
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes?.trim();
    }

    if (body.is_default !== undefined) {
      updates.is_default = Boolean(body.is_default);
    }

    const template = await updateTemplate(id, updates, user.email);

    if (!template) {
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template,
      message: 'Template updated successfully',
    });
  } catch (error: any) {
    console.error('Update template error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dashboard/quote-templates/[id]
 * Delete a template
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const success = await deleteTemplate(id, user.email);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete template error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete template' },
      { status: 500 }
    );
  }
}

