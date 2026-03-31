/**
 * Quote Template Storage Utilities
 * Handles storing and retrieving quote templates
 */

import { getWpBaseUrl } from './auth';
import { getAuthToken } from './auth-server';
import type { QuoteTemplate, QuoteTemplatePayload } from './types/quote-template';

/**
 * Generate unique template ID
 */
export function generateTemplateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `TEMPLATE-${timestamp}-${random}`;
}

/**
 * Store a quote template
 */
export async function storeTemplate(
  payload: QuoteTemplatePayload,
  userEmail: string,
  userId?: number
): Promise<QuoteTemplate | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const templateId = generateTemplateId();
  const now = new Date().toISOString();

  const template: QuoteTemplate = {
    id: templateId,
    name: payload.name,
    description: payload.description,
    user_id: userId,
    user_email: userEmail,
    items: payload.items,
    shipping_method: payload.shipping_method,
    notes: payload.notes,
    is_default: payload.is_default || false,
    created_at: now,
    updated_at: now,
    usage_count: 0,
  };

  try {
    // Store as WordPress custom post type
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quote-templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: template.name,
        status: 'publish',
        meta: {
          template_id: templateId,
          template_data: JSON.stringify(template),
          user_email: userEmail,
          user_id: userId || '',
          is_default: template.is_default ? '1' : '0',
        },
      }),
    });

    if (response.ok) {
      return template;
    }

    console.error('Failed to store template:', await response.text());
    return null;
  } catch (error) {
    console.error('Error storing template:', error);
    throw error;
  }
}

/**
 * Fetch all templates for a user
 */
export async function fetchUserTemplates(userEmail: string): Promise<QuoteTemplate[]> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return [];
  }

  const token = await getAuthToken();
  if (!token) {
    return [];
  }

  try {
    // Fetch templates from WordPress custom post type
    const response = await fetch(
      `${wpBase}/wp-json/wp/v2/quote-templates?meta_key=user_email&meta_value=${encodeURIComponent(userEmail)}&per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const posts = await response.json();
      if (Array.isArray(posts)) {
        return posts
          .map((post: any) => {
            try {
              const templateData = post.meta?.template_data
                ? JSON.parse(post.meta.template_data)
                : null;

              if (!templateData) return null;

              return {
                ...templateData,
                id: templateData.id || post.meta?.template_id || post.id.toString(),
              };
            } catch (parseError) {
              console.error('Error parsing template data:', parseError);
              return null;
            }
          })
          .filter((t: QuoteTemplate | null) => t !== null) as QuoteTemplate[];
      }
    }
  } catch (fetchError) {
    console.debug('Custom post type fetch failed, templates may not be stored yet');
  }

  return [];
}

/**
 * Get template by ID
 */
export async function getTemplateById(
  templateId: string,
  userEmail?: string
): Promise<QuoteTemplate | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return null;
  }

  const token = await getAuthToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(
      `${wpBase}/wp-json/wp/v2/quote-templates?meta_key=template_id&meta_value=${encodeURIComponent(templateId)}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    );

    if (response.ok) {
      const posts = await response.json();
      if (Array.isArray(posts) && posts.length > 0) {
        const post = posts[0];
        try {
          const templateData = post.meta?.template_data
            ? JSON.parse(post.meta.template_data)
            : null;

          if (!templateData) return null;

          // Check ownership if userEmail provided
          if (userEmail && templateData.user_email?.toLowerCase() !== userEmail.toLowerCase()) {
            return null;
          }

          return {
            ...templateData,
            id: templateData.id || post.meta?.template_id || post.id.toString(),
          };
        } catch (parseError) {
          console.error('Error parsing template data:', parseError);
          return null;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching template:', error);
  }

  return null;
}

/**
 * Update template
 */
export async function updateTemplate(
  templateId: string,
  updates: Partial<QuoteTemplatePayload>,
  userEmail: string
): Promise<QuoteTemplate | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  // Get existing template
  const existing = await getTemplateById(templateId, userEmail);
  if (!existing) {
    throw new Error('Template not found');
  }

  const updated: QuoteTemplate = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  try {
    // Find the WordPress post ID
    const findResponse = await fetch(
      `${wpBase}/wp-json/wp/v2/quote-templates?meta_key=template_id&meta_value=${encodeURIComponent(templateId)}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!findResponse.ok) {
      throw new Error('Failed to find template');
    }

    const posts = await findResponse.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new Error('Template not found');
    }

    const postId = posts[0].id;

    // Update the template
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quote-templates/${postId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: updated.name,
        meta: {
          template_id: templateId,
          template_data: JSON.stringify(updated),
          user_email: userEmail,
          user_id: updated.user_id || '',
          is_default: updated.is_default ? '1' : '0',
        },
      }),
    });

    if (response.ok) {
      return updated;
    }

    return null;
  } catch (error) {
    console.error('Error updating template:', error);
    throw error;
  }
}

/**
 * Delete template
 */
export async function deleteTemplate(
  templateId: string,
  userEmail: string
): Promise<boolean> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  // Verify ownership
  const template = await getTemplateById(templateId, userEmail);
  if (!template) {
    throw new Error('Template not found or unauthorized');
  }

  try {
    // Find the WordPress post ID
    const findResponse = await fetch(
      `${wpBase}/wp-json/wp/v2/quote-templates?meta_key=template_id&meta_value=${encodeURIComponent(templateId)}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!findResponse.ok) {
      throw new Error('Failed to find template');
    }

    const posts = await findResponse.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new Error('Template not found');
    }

    const postId = posts[0].id;

    // Delete the template
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quote-templates/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting template:', error);
    throw error;
  }
}

/**
 * Increment template usage count
 */
export async function incrementTemplateUsage(templateId: string): Promise<void> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return;
  }

  const token = await getAuthToken();
  if (!token) {
    return;
  }

  try {
    const template = await getTemplateById(templateId);
    if (!template) return;

    const updated: QuoteTemplate = {
      ...template,
      usage_count: (template.usage_count || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    // Find and update
    const findResponse = await fetch(
      `${wpBase}/wp-json/wp/v2/quote-templates?meta_key=template_id&meta_value=${encodeURIComponent(templateId)}&per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!findResponse.ok) return;

    const posts = await findResponse.json();
    if (!Array.isArray(posts) || posts.length === 0) return;

    const postId = posts[0].id;

    await fetch(`${wpBase}/wp-json/wp/v2/quote-templates/${postId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: {
          template_id: templateId,
          template_data: JSON.stringify(updated),
          user_email: template.user_email,
          user_id: template.user_id || '',
          is_default: updated.is_default ? '1' : '0',
        },
      }),
    });
  } catch (error) {
    console.error('Error incrementing template usage:', error);
    // Don't throw - usage tracking failure shouldn't break the flow
  }
}

